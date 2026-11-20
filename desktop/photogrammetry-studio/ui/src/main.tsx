import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
class Boundary extends React.Component<{ children: React.ReactNode }, { err: string }> {
  state = { err: "" }; static getDerivedStateFromError(e: Error) { return { err: e.message }; }
  render() { return this.state.err ? <div role="alert" className="p-6 text-red-200">The interface hit an unexpected error: {this.state.err}. <button className="ml-2 underline" onClick={() => location.reload()}>Reload</button></div> : this.props.children; }
}
createRoot(document.getElementById("root")!).render(<React.StrictMode><Boundary><App /></Boundary></React.StrictMode>);
