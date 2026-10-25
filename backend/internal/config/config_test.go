package config

import (
	"testing"
	"time"
)

func TestPlanTimeout(t *testing.T) {
	for _, tc := range []struct {
		name    string
		value   string
		want    time.Duration
		wantErr bool
	}{
		{"unset defaults to 90s", "", 90 * time.Second, false},
		{"parsed as a Go duration", "55s", 55 * time.Second, false},
		{"zero is rejected", "0s", 0, true},
		{"garbage is rejected", "soon", 0, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("AF_PLAN_TIMEOUT", tc.value)
			cfg, err := Load()
			if tc.wantErr {
				if err == nil {
					t.Fatal("want an error")
				}
				return
			}
			if err != nil {
				t.Fatalf("Load: %v", err)
			}
			if cfg.PlanTimeout != tc.want {
				t.Fatalf("PlanTimeout = %v, want %v", cfg.PlanTimeout, tc.want)
			}
		})
	}
}
