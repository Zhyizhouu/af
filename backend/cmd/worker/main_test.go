package main

import (
	"testing"

	"go.temporal.io/sdk/testsuite"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

// Everything the worker registers has to coexist.
//
// Temporal registers activities by method name into a single flat namespace
// per worker, so two structs sharing a method name panic the process at boot.
// A package's own tests cannot catch that — they register one struct into
// their own environment — which is how a duplicate `Discard` once went out and
// crash-looped the workers on first run.
//
// One workflow lives here today. The test stays because the failure it guards
// against only appears when a second one arrives.
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
}
