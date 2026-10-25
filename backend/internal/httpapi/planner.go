package httpapi

import (
	"log/slog"

	"github.com/Zhyizhouu/af/backend/internal/config"
	"github.com/Zhyizhouu/af/backend/internal/gemini"
)

// PlannerFromConfig builds the assistant's model client, or returns nil
// without a Gemini key so the page says the assistant is unavailable. Both
// entry points, the long-running api and the serverless function, build it
// here so the warning and the wiring cannot drift apart.
func PlannerFromConfig(cfg config.Config, log *slog.Logger) (Planner, error) {
	if cfg.GeminiAPIKey == "" {
		log.Warn("AF_GEMINI_API_KEY is unset: the assistant is unavailable")
		return nil, nil
	}
	assistant, err := gemini.New(gemini.Options{
		APIKey: cfg.GeminiAPIKey,
		Model:  cfg.GeminiModel,
		Logger: log,
	})
	if err != nil {
		return nil, err
	}
	log.Info("assistant ready", "model", assistant.Model())
	return assistant, nil
}
