import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing.js';
import Login from './pages/Login.js';
import Register from './pages/Register.js';
import ForgotPassword from './pages/ForgotPassword.js';
import ResetPassword from './pages/ResetPassword.js';
import VerifyEmail from './pages/VerifyEmail.js';
import Management from './pages/Management.js';
import Onboarding from './pages/Onboarding.js';
import SecuritySettings from './pages/SecuritySettings.js';
import Team from './pages/Team.js';
import NotFound from './pages/NotFound.js';
import Privacy from './pages/Privacy.js';
import Terms from './pages/Terms.js';
import { ProtectedRoute } from './routes/ProtectedRoute.js';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/verify-email" element={<VerifyEmail />} />
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <Management />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/security"
        element={
          <ProtectedRoute>
            <SecuritySettings />
          </ProtectedRoute>
        }
      />
      <Route
        path="/app/team"
        element={
          <ProtectedRoute>
            <Team />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
