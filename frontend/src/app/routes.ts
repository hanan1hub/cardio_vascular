import { createBrowserRouter } from "react-router";
import Root from "./pages/Root";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Dashboard from "./pages/Dashboard";
import DoctorDashboard from "./pages/DoctorDashboard";
import Profile from "./pages/Profile";
import ContactDoctor from "./pages/ContactDoctor";
import DoctorChat from "./pages/DoctorChat";
import LoginWrapper from "./pages/LoginWrapper";
import AdminDashboard from "./pages/AdminDashboard";

export const router = createBrowserRouter([
  {
    path: "/",
    Component: Root,
  },
  {
    path: "/login",
    Component: LoginWrapper,
  },
  {
    path: "/signup",
    Component: Signup,
  },
  {
    path: "/dashboard",
    Component: Dashboard,
  },
  {
    path: "/doctor-dashboard",
    Component: DoctorDashboard,
  },
  {
    path: "/profile",
    Component: Profile,
  },
  {
    path: "/contact-doctor",
    Component: ContactDoctor,
  },
  {
    path: "/doctor-chat/:patientId",
    Component: DoctorChat,
  },
  {
    path: "/admin-dashboard",
    Component: AdminDashboard,
  },
]);
