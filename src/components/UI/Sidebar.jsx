function Sidebar({ machine, selectedMachine, onSelect }) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 h-full">

      <h2 className="text-2xl font-bold mb-6">
        Machines
      </h2>

      <div className="space-y-4">

        {machine.map((item) => (

          <button
            key={item.id}
            onClick={() => onSelect(item)}
            className={`w-full rounded-xl border p-4 text-left transition-all duration-300 ${
              selectedMachine.id === item.id
                ? "bg-cyan-500 border-cyan-500"
                : "bg-zinc-800 border-zinc-700 hover:bg-zinc-700"
            }`}
          >

            <div className="flex items-center gap-4">

              {/* Thumbnail */}
              <img
                src={item.thumbnail}
                alt={item.name}
                className="w-16 h-16 object-contain rounded-lg bg-zinc-900 p-2"
              />

              {/* Machine Details */}
              <div className="flex-1">

                <h3 className="text-lg font-semibold">
                  {item.name}
                </h3>

                <p className="text-sm text-zinc-300 mt-1">
                  {item.description}
                </p>

                <div className="flex items-center gap-2 mt-3">

                  <div
                    className={`w-2.5 h-2.5 rounded-full ${
                      item.status === "Ready"
                        ? "bg-green-500"
                        : "bg-yellow-500"
                    }`}
                  />

                  <span className="text-xs text-zinc-300">
                    {item.status}
                  </span>

                </div>

              </div>

            </div>

          </button>

        ))}

      </div>

    </div>
  );
}

export default Sidebar;