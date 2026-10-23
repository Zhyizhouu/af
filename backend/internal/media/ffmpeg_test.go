package media

import (
	"strings"
	"testing"

	"github.com/Zhyizhouu/af/backend/internal/convert"
)

func TestReadProgressWithoutDurationStillReports(t *testing.T) {
	stream := "out_time_us=1000000\nprogress=continue\nout_time_us=2000000\nprogress=end\n"

	var got []float64
	readProgress(strings.NewReader(stream), 0, func(f float64) { got = append(got, f) })

	if len(got) != 2 {
		t.Fatalf("reports = %v, want one per block", got)
	}
	for _, f := range got {
		if f >= 0 {
			t.Fatalf("fraction %v should be negative when the length is unknown", f)
		}
	}
}

func TestReadProgressWithDurationReportsFraction(t *testing.T) {
	var got []float64
	readProgress(strings.NewReader("out_time_us=5000000\nprogress=continue\n"), 10,
		func(f float64) { got = append(got, f) })

	if len(got) != 1 || got[0] != 0.5 {
		t.Fatalf("got %v, want [0.5]", got)
	}
}

func TestArgumentsRestrictProtocols(t *testing.T) {
	format, err := convert.FormatByID("mp3")
	if err != nil {
		t.Fatal(err)
	}
	args := strings.Join(arguments("in.mp3", "out.mp3", convert.Options{Format: format, Bitrate: 192}), " ")
	if !strings.Contains(args, "-protocol_whitelist file,pipe -i in.mp3") {
		t.Fatalf("whitelist must precede the input: %s", args)
	}
}
