// Package gemini adapts Google's Generative Language API to the
// caption.Transcriber port.
//
// Written against the REST API directly rather than the Go SDK: it is three
// calls, the SDK pulls in a large dependency tree for them, and the surface
// used here is small enough that being explicit about it is an advantage when
// the API moves.
//
// Audio leaves the host for this. It is uploaded to Google, transcribed, and
// then deleted again by the same job — see Transcribe. Files also expire on
// Google's side after about two days, but waiting for that is not a policy.
package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/Zhyizhouu/af/backend/internal/caption"
)

const defaultBaseURL = "https://generativelanguage.googleapis.com"

// DefaultModel is the moving alias rather than a pinned version, because a
// pinned one goes stale silently and the failure is baffling: a dated model
// keeps working for projects that already used it and returns 404 to everyone
// else, so the same code works on one key and not on another.
//
// The trade is that behaviour can shift underneath a running deployment. Set
// AF_GEMINI_MODEL to pin a specific version where that matters more.
const DefaultModel = "gemini-flash-latest"

type Client struct {
	apiKey  string
	model   string
	baseURL string
	http    *http.Client
}

type Options struct {
	APIKey  string
	Model   string
	BaseURL string

	// Transcribing ten minutes of audio is not a fast request, and the whole
	// call is one round trip.
	Timeout time.Duration
}

func New(opt Options) (*Client, error) {
	if strings.TrimSpace(opt.APIKey) == "" {
		return nil, errors.New("a Gemini API key is required to generate captions")
	}
	if opt.Model == "" {
		opt.Model = DefaultModel
	}
	if opt.BaseURL == "" {
		opt.BaseURL = defaultBaseURL
	}
	if opt.Timeout <= 0 {
		opt.Timeout = 10 * time.Minute
	}

	return &Client{
		apiKey:  opt.APIKey,
		model:   opt.Model,
		baseURL: strings.TrimRight(opt.BaseURL, "/"),
		http:    &http.Client{Timeout: opt.Timeout},
	}, nil
}

// Transcribe uploads one chunk of audio, asks for timed segments, and removes
// the upload again.
//
// The delete runs on a context that outlives a cancelled request, for the same
// reason the workflow's cleanup does: the moment a job is abandoned is exactly
// the moment a copy of somebody's lecture would be left sitting on somebody
// else's servers.
func (c *Client) Transcribe(
	ctx context.Context,
	audioPath, languageHint string,
) ([]caption.Segment, error) {
	uploaded, err := c.upload(ctx, audioPath)
	if err != nil {
		return nil, err
	}
	defer func() {
		removal, cancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
		defer cancel()
		if err := c.delete(removal, uploaded.Name); err != nil {
			// Not fatal: Google expires the file on its own within about two
			// days. Worth knowing about, because that is the window in which
			// the audio exists in two places.
			fmt.Fprintf(os.Stderr, "gemini: upload %s not deleted: %v\n", uploaded.Name, err)
		}
	}()

	if err := c.waitUntilActive(ctx, uploaded.Name); err != nil {
		return nil, err
	}
	return c.generate(ctx, uploaded.URI, uploaded.MIMEType, languageHint)
}

// ---- files ----

type uploadedFile struct {
	Name     string `json:"name"`
	URI      string `json:"uri"`
	MIMEType string `json:"mimeType"`
	State    string `json:"state"`
}

// upload sends the audio through the resumable upload endpoint.
//
// Inline data would be one call fewer, but it is capped at a request size that
// ten minutes of audio can exceed, and failing only on long files is the worst
// kind of limit to design against.
func (c *Client) upload(ctx context.Context, path string) (uploadedFile, error) {
	info, err := os.Stat(path)
	if err != nil {
		return uploadedFile{}, fmt.Errorf("reading audio: %w", err)
	}

	mimeType := mime.TypeByExtension(filepath.Ext(path))
	if mimeType == "" {
		mimeType = "audio/wav"
	}

	start, err := c.request(ctx, http.MethodPost,
		c.baseURL+"/upload/v1beta/files",
		bytes.NewReader([]byte(`{"file":{"display_name":"af-caption-audio"}}`)),
		map[string]string{
			"X-Goog-Upload-Protocol":              "resumable",
			"X-Goog-Upload-Command":               "start",
			"X-Goog-Upload-Header-Content-Length": fmt.Sprintf("%d", info.Size()),
			"X-Goog-Upload-Header-Content-Type":   mimeType,
			"Content-Type":                        "application/json",
		})
	if err != nil {
		return uploadedFile{}, err
	}
	uploadURL := start.Header.Get("X-Goog-Upload-URL")
	start.Body.Close()

	if uploadURL == "" {
		return uploadedFile{}, errors.New("gemini did not offer an upload url")
	}

	file, err := os.Open(path)
	if err != nil {
		return uploadedFile{}, fmt.Errorf("reading audio: %w", err)
	}
	defer file.Close()

	response, err := c.request(ctx, http.MethodPost, uploadURL, file, map[string]string{
		"X-Goog-Upload-Command":        "upload, finalize",
		"X-Goog-Upload-Offset":         "0",
		"Content-Type":                 mimeType,
		"X-Goog-Upload-Content-Length": fmt.Sprintf("%d", info.Size()),
	})
	if err != nil {
		return uploadedFile{}, err
	}
	defer response.Body.Close()

	var body struct {
		File uploadedFile `json:"file"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		return uploadedFile{}, fmt.Errorf("reading the upload response: %w", err)
	}
	if body.File.URI == "" {
		return uploadedFile{}, errors.New("gemini accepted the upload but named no file")
	}
	if body.File.MIMEType == "" {
		body.File.MIMEType = mimeType
	}
	return body.File, nil
}

// waitUntilActive polls until the upload finishes processing. A file referred
// to while it is still PROCESSING is rejected, so this is not optional.
func (c *Client) waitUntilActive(ctx context.Context, name string) error {
	const (
		every = 2 * time.Second
		limit = 5 * time.Minute
	)

	deadline := time.Now().Add(limit)
	for {
		response, err := c.request(ctx, http.MethodGet,
			fmt.Sprintf("%s/v1beta/%s", c.baseURL, name), nil, nil)
		if err != nil {
			return err
		}

		var file uploadedFile
		decodeErr := json.NewDecoder(response.Body).Decode(&file)
		response.Body.Close()
		if decodeErr != nil {
			return fmt.Errorf("reading the file state: %w", decodeErr)
		}

		switch file.State {
		case "ACTIVE":
			return nil
		case "FAILED":
			return errors.New("gemini could not process that audio")
		}

		if time.Now().After(deadline) {
			return errors.New("gemini is still processing the audio after five minutes")
		}
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(every):
		}
	}
}

func (c *Client) delete(ctx context.Context, name string) error {
	response, err := c.request(ctx, http.MethodDelete,
		fmt.Sprintf("%s/v1beta/%s", c.baseURL, name), nil, nil)
	if err != nil {
		return err
	}
	response.Body.Close()
	return nil
}

// ---- generation ----

// The response schema. Asking for JSON in the prompt and hoping is the usual
// way this goes wrong; a schema makes the model's output parseable by
// construction, so the only thing left to check is whether the numbers are
// sensible — which Normalise does.
var segmentSchema = map[string]any{
	"type": "array",
	"items": map[string]any{
		"type": "object",
		"properties": map[string]any{
			"start": map[string]any{
				"type":        "number",
				"description": "Seconds from the start of this audio.",
			},
			"end": map[string]any{
				"type":        "number",
				"description": "Seconds from the start of this audio.",
			},
			"text": map[string]any{
				"type":        "string",
				"description": "What is said, punctuated, at most two short lines.",
			},
		},
		"required": []string{"start", "end", "text"},
	},
}

const prompt = `Transcribe this audio as subtitle segments.

Rules:
- Time everything from the start of THIS audio clip. The first moment is 0.
- One segment per natural phrase or sentence. Split on pauses, not on a word count.
- Keep segments between 1 and 7 seconds. Split anything longer.
- Punctuate properly and use sentence case. Do not write filler sounds.
- Transcribe what is said, in the language it is said in. Do not translate.
- Cover the whole clip. Do not summarise, comment, or skip quiet passages that contain speech.
- If there is no speech at all, return an empty array.`

func (c *Client) generate(
	ctx context.Context,
	fileURI, mimeType, languageHint string,
) ([]caption.Segment, error) {
	instruction := prompt
	if languageHint != "" {
		instruction += "\n- The speech is mainly in " + languageHint + "."
	}

	payload := map[string]any{
		"contents": []any{
			map[string]any{
				"parts": []any{
					map[string]any{"text": instruction},
					map[string]any{
						"file_data": map[string]any{
							"mime_type": mimeType,
							"file_uri":  fileURI,
						},
					},
				},
			},
		},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
			"responseSchema":   segmentSchema,
			// Transcription is not a creative task; the same audio should give
			// the same captions twice.
			"temperature": 0,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	response, err := c.request(ctx, http.MethodPost,
		fmt.Sprintf("%s/v1beta/models/%s:generateContent", c.baseURL, c.model),
		bytes.NewReader(body),
		map[string]string{"Content-Type": "application/json"})
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()

	var parsed struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
			FinishReason string `json:"finishReason"`
		} `json:"candidates"`
		PromptFeedback struct {
			BlockReason string `json:"blockReason"`
		} `json:"promptFeedback"`
		UsageMetadata struct {
			PromptTokenCount     int `json:"promptTokenCount"`
			CandidatesTokenCount int `json:"candidatesTokenCount"`
			TotalTokenCount      int `json:"totalTokenCount"`
		} `json:"usageMetadata"`
	}
	if err := json.NewDecoder(response.Body).Decode(&parsed); err != nil {
		return nil, fmt.Errorf("reading the transcription: %w", err)
	}

	// Logged per request so quota use is observable rather than guessed at.
	// Audio bills at roughly 32 tokens a second, so a ten-minute chunk is
	// around 19k prompt tokens — the request count is what runs out first on a
	// free key, not the tokens.
	fmt.Fprintf(os.Stderr,
		"gemini: model=%s prompt_tokens=%d output_tokens=%d total_tokens=%d\n",
		c.model,
		parsed.UsageMetadata.PromptTokenCount,
		parsed.UsageMetadata.CandidatesTokenCount,
		parsed.UsageMetadata.TotalTokenCount,
	)

	if parsed.PromptFeedback.BlockReason != "" {
		return nil, fmt.Errorf("gemini refused that audio (%s)", parsed.PromptFeedback.BlockReason)
	}
	if len(parsed.Candidates) == 0 {
		return nil, errors.New("gemini returned no transcription")
	}

	var text strings.Builder
	for _, part := range parsed.Candidates[0].Content.Parts {
		text.WriteString(part.Text)
	}
	if text.Len() == 0 {
		// MAX_TOKENS here means the chunk was too long for one answer, which
		// is a chunk-size problem rather than a bad file.
		return nil, fmt.Errorf("gemini returned nothing (%s)",
			parsed.Candidates[0].FinishReason)
	}

	var segments []caption.Segment
	if err := json.Unmarshal([]byte(text.String()), &segments); err != nil {
		return nil, fmt.Errorf("gemini's transcription did not parse: %w", err)
	}
	return segments, nil
}

// ---- transport ----

func (c *Client) request(
	ctx context.Context,
	method, url string,
	body io.Reader,
	headers map[string]string,
) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, err
	}
	// On the header rather than in the query string, so a key cannot end up in
	// a proxy's access log.
	request.Header.Set("x-goog-api-key", c.apiKey)
	for key, value := range headers {
		request.Header.Set(key, value)
	}

	response, err := c.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("reaching gemini: %w", err)
	}
	if response.StatusCode >= 400 {
		detail, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
		response.Body.Close()
		body := strings.TrimSpace(string(detail))

		switch response.StatusCode {
		case http.StatusTooManyRequests:
			// Worth naming, because it is the one failure that is neither a
			// bug nor a bad file — the key is fine and the request was
			// correct. Left retryable: a per-minute quota clears on its own,
			// and Temporal's backoff is exactly the right response to it. A
			// daily quota will simply exhaust the attempts.
			return nil, fmt.Errorf(
				"gemini quota reached — wait for it to reset or raise the "+
					"limit on this key: %s", body)
		case http.StatusUnauthorized, http.StatusForbidden:
			return nil, fmt.Errorf(
				"gemini rejected the API key (%d): %s", response.StatusCode, body)
		case http.StatusNotFound:
			// Overwhelmingly a retired model name, and the raw message says so
			// at length; point at the fix.
			return nil, fmt.Errorf(
				"gemini has no model %q — set AF_GEMINI_MODEL to a current "+
					"one: %s", c.model, body)
		}
		return nil, fmt.Errorf("gemini returned %d: %s", response.StatusCode, body)
	}
	return response, nil
}
