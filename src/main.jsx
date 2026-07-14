import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map-index.css";
import "./dashboard.css";

createRoot(document.getElementById("root")).render(<App />);
