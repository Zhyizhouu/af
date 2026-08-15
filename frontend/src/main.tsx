import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Shell } from './app/Shell';
import { SignIn } from './app/SignIn';
import { SessionProvider, useSession } from './app/session';
import { programs } from './app/programs';
import { AFEmptyState } from './components/AF';
import './theme/tokens.css';

/**
 * The gate.
 *
 * Every program requires an account, and the router enforces it for typed URLs
 * as well as for clicks — otherwise a deep link would walk straight past the
 * sign-in page into an empty database.
 */
function Gate() {
  const { user, ready } = useSession();

  // Firebase resolves the current user asynchronously. Rendering the sign-in
  // page during that beat would flash it at somebody who is already signed in.
  if (!ready) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%' }}>
        <AFEmptyState glyph="" message="Checking your session…" />
      </div>
    );
  }

  if (!user) return <SignIn />;

  return (
    <Routes>
      {/* Real paths, not a hash router: `/calendar?split=ai` has to survive a
          refresh, which is the whole reason the split lives in the URL. */}
      <Route path="/:slug" element={<Shell />} />
      <Route path="*" element={<Navigate to={`/${programs[0]!.slug}`} replace />} />
    </Routes>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('no #root to mount into');

createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <Gate />
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
