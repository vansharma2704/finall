import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/Home";
import ARViewer from "./pages/ARViewer";

function App() {
  return (
    <BrowserRouter>
      <Routes>

        <Route
          path="/"
          element={<Home />}
        />

        <Route
          path="/ar/:id"
          element={<ARViewer />}
        />

      </Routes>
    </BrowserRouter>
  );
}

export default App;