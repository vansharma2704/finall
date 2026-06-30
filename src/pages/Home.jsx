import { useState } from "react";

import { machine } from "../data/machine";

import Header from "../components/UI/Header";
import Sidebar from "../components/UI/Sidebar";
import Viewer from "../components/Viewer/Viewer";
import InfoPanel from "../components/UI/InfoPanel";

function Home() {
  const [selectedMachine, setSelectedMachine] = useState(machine[0]);

  return (
    <div className="min-h-screen bg-zinc-950 text-white">

      <Header />

      <main className="grid grid-cols-12 gap-6 p-6">

        <aside className="col-span-3">
          <Sidebar
            machine={machine}
            selectedMachine={selectedMachine}
            onSelect={setSelectedMachine}
          />
        </aside>

        <section className="col-span-9">
          <Viewer machine={selectedMachine} />
        </section>

      </main>

      <div className="px-6 pb-6">
        <InfoPanel machine={selectedMachine} />
      </div>

    </div>
  );
}

export default Home;