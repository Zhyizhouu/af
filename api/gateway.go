package handler

import (
	"net/http"

	"github.com/Zhyizhouu/af/backend/vercelfn"
)

func Handler(w http.ResponseWriter, r *http.Request) {
	vercelfn.Handler(w, r)
}
