import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import MockCheckout from "./pages/MockCheckout.jsx";
import "./index.css";

const Page = window.location.pathname === "/mock-checkout" ? MockCheckout : App;
createRoot(document.getElementById("root")).render(<Page />);
