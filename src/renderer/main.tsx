import { createRoot } from "react-dom/client";
import { FeedbackProvider } from "./app/Feedback";
import { App } from "./app/App";
import "./styles.css";
const root = document.getElementById("root");
if (!root) throw new Error("Application root is missing");
createRoot(root).render(
  <FeedbackProvider>
    <App />
  </FeedbackProvider>,
);
