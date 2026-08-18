package httpapi

import "net/http"

// meResponse tells the app what this account may reach.
//
// The client can decode its own ID token and read the same claim, and the sign
// in flow does exactly that to decide what to draw. This endpoint exists
// because that decode is a rendering decision made on data the user controls
// the storage of; the server's answer is the one that matches what the routes
// will actually permit. When the two disagree, this is right.
type meResponse struct {
	UID   string `json:"uid"`
	Admin bool   `json:"admin"`
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request) {
	caller, ok := s.verify(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, meResponse{UID: caller.UID, Admin: caller.Admin})
}
