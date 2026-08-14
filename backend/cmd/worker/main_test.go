package main

import (
	"testing"

	"go.temporal.io/sdk/testsuite"

	"github.com/Zhyizhouu/af/backend/internal/caption"
	"github.com/Zhyizhouu/af/backend/internal/convert"
)

// Both activity sets have to coexist on one worker.
//
// Temporal registers activities by method name into a single flat namespace
// per worker, so two structs sharing a method name panic the process at boot.
// Neither package's own tests can catch that — they each register one struct
// into their own environment — which is exactly how a `Discard` on both went
// out and crash-looped the workers on first run.
//
// This registers everything the real worker registers, in the same order.
func TestEveryWorkflowAndActivityRegistersTogether(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("registering the worker's full set panicked: %v", r)
		}
	}()

	var suite testsuite.WorkflowTestSuite
	env := suite.NewTestWorkflowEnvironment()

	env.RegisterWorkflow(convert.Audio)
	env.RegisterActivity(&convert.Activities{})

	env.RegisterWorkflow(caption.Generate)
	env.RegisterActivity(&caption.Activities{})
}
