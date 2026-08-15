// Package gemini adapts Google's Generative Language API to whatever the rest
// of the backend needs from a model.
//
// Written against the REST API directly rather than the Go SDK: the surface
// used here is one call, the SDK pulls in a large dependency tree for it, and
// being explicit is an advantage when the API moves — which it does.
package gemini

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"
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
	log     *slog.Logger
	http    *http.Client
}

type Options struct {
	APIKey  string
	Model   string
	BaseURL string
	Logger  *slog.Logger
	Timeout time.Duration
}

func New(opt Options) (*Client, error) {
	if strings.TrimSpace(opt.APIKey) == "" {
		return nil, errors.New("a Gemini API key is required")
	}
	if opt.Model == "" {
		opt.Model = DefaultModel
	}
	if opt.BaseURL == "" {
		opt.BaseURL = defaultBaseURL
	}
	if opt.Timeout <= 0 {
		opt.Timeout = time.Minute
	}
	if opt.Logger == nil {
		opt.Logger = slog.Default()
	}

	return &Client{
		apiKey:  opt.APIKey,
		model:   opt.Model,
		baseURL: strings.TrimRight(opt.BaseURL, "/"),
		log:     opt.Logger,
		http:    &http.Client{Timeout: opt.Timeout},
	}, nil
}

func (c *Client) Model() string { return c.model }

// ErrQuota marks the one failure that is neither a bug nor bad input: the key
// is fine and the request was correct, there is just none left this minute.
var ErrQuota = errors.New("gemini quota reached")

// Roles a turn can take, as this API names them.
const (
	RoleUser  = "user"
	RoleModel = "model"
)

// Turn is one message in a conversation.
//
// Sent as separate contents rather than pasted into one string, so the model
// can tell its own previous answers from the person's text. That distinction
// is not cosmetic: a transcript flattened into a single prompt lets anyone who
// can type "Assistant:" put words in the model's mouth.
type Turn struct {
	Role string
	Text string
}

// GenerateJSON asks the model for an answer matching schema.
//
// A schema rather than a request to "reply in JSON": the response parses by
// construction instead of hopefully, which leaves only the values to check.
// Checking them is the caller's job — a schema constrains shape, never sense.
func (c *Client) GenerateJSON(
	ctx context.Context,
	instructions string,
	turns []Turn,
	schema map[string]any,
	into any,
) error {
	if len(turns) == 0 {
		return errors.New("there is nothing to ask about")
	}

	contents := make([]any, 0, len(turns))
	for _, turn := range turns {
		role := RoleUser
		if turn.Role == RoleModel {
			role = RoleModel
		}
		contents = append(contents, map[string]any{
			"role":  role,
			"parts": []any{map[string]any{"text": turn.Text}},
		})
	}

	payload := map[string]any{
		"contents": contents,
		"systemInstruction": map[string]any{
			"parts": []any{map[string]any{"text": instructions}},
		},
		"generationConfig": map[string]any{
			"responseMimeType": "application/json",
			"responseSchema":   schema,
			// Scheduling is not a creative task; the same sentence should give
			// the same entries twice.
			"temperature": 0,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	response, err := c.post(ctx,
		fmt.Sprintf("%s/v1beta/models/%s:generateContent", c.baseURL, c.model),
		body)
	if err != nil {
		return err
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
		return fmt.Errorf("reading the model's answer: %w", err)
	}

	// Logged per request so quota use is observable rather than guessed at.
	c.log.Info("gemini",
		"model", c.model,
		"prompt_tokens", parsed.UsageMetadata.PromptTokenCount,
		"output_tokens", parsed.UsageMetadata.CandidatesTokenCount,
		"total_tokens", parsed.UsageMetadata.TotalTokenCount,
	)

	if parsed.PromptFeedback.BlockReason != "" {
		return fmt.Errorf("gemini refused that request (%s)",
			parsed.PromptFeedback.BlockReason)
	}
	if len(parsed.Candidates) == 0 {
		return errors.New("gemini returned nothing")
	}

	var text strings.Builder
	for _, part := range parsed.Candidates[0].Content.Parts {
		text.WriteString(part.Text)
	}
	if text.Len() == 0 {
		return fmt.Errorf("gemini returned nothing (%s)",
			parsed.Candidates[0].FinishReason)
	}

	if err := json.Unmarshal([]byte(text.String()), into); err != nil {
		return fmt.Errorf("gemini's answer did not parse: %w", err)
	}
	return nil
}

// ErrBusy is Google's own capacity problem rather than anything about this
// request. It clears on its own, usually within seconds.
var ErrBusy = errors.New("gemini is busy")

// post sends the request, retrying the failures that are worth retrying.
//
// There is no Temporal behind this endpoint — it is one synchronous call — so
// the retry has to live here. Only 503 and 500 are repeated: a busy model
// clears in seconds, while a bad key or a retired model name will fail
// identically forever and repeating it just makes the caller wait longer.
func (c *Client) post(ctx context.Context, url string, body []byte) (*http.Response, error) {
	const attempts = 3
	backoff := 700 * time.Millisecond

	var lastErr error
	for attempt := 1; ; attempt++ {
		response, err := c.postOnce(ctx, url, body)
		if err == nil {
			return response, nil
		}
		lastErr = err

		if attempt == attempts || !errors.Is(err, ErrBusy) {
			return nil, lastErr
		}
		c.log.Warn("gemini busy, retrying",
			"attempt", attempt, "in", backoff.String())

		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(backoff):
		}
		backoff *= 2
	}
}

func (c *Client) postOnce(ctx context.Context, url string, body []byte) (*http.Response, error) {
	request, err := http.NewRequestWithContext(
		ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	// On the header rather than in the query string, so a key cannot end up in
	// a proxy's access log.
	request.Header.Set("x-goog-api-key", c.apiKey)
	request.Header.Set("Content-Type", "application/json")

	response, err := c.http.Do(request)
	if err != nil {
		return nil, fmt.Errorf("reaching gemini: %w", err)
	}
	if response.StatusCode < 400 {
		return response, nil
	}

	detail, _ := io.ReadAll(io.LimitReader(response.Body, 2048))
	response.Body.Close()
	text := strings.TrimSpace(string(detail))

	switch response.StatusCode {
	case http.StatusServiceUnavailable, http.StatusInternalServerError:
		return nil, fmt.Errorf("%w (%d): %s", ErrBusy, response.StatusCode, text)
	case http.StatusTooManyRequests:
		return nil, fmt.Errorf("%w — wait for it to reset or raise the limit "+
			"on this key: %s", ErrQuota, text)
	case http.StatusUnauthorized, http.StatusForbidden:
		return nil, fmt.Errorf(
			"gemini rejected the API key (%d): %s", response.StatusCode, text)
	case http.StatusNotFound:
		// Overwhelmingly a retired model name; point at the fix rather than
		// reprinting Google's paragraph about it.
		return nil, fmt.Errorf("gemini has no model %q — set AF_GEMINI_MODEL "+
			"to a current one: %s", c.model, text)
	}
	return nil, fmt.Errorf("gemini returned %d: %s", response.StatusCode, text)
}
