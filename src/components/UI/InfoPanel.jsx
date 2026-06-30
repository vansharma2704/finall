import { useNavigate } from "react-router-dom";

function InfoPanel({ machine }) {
  const navigate = useNavigate();
  if (!machine) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 mt-6">

      <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-6">

        {/* Left */}
        <div>
          <h2 className="text-3xl font-bold">
            {machine.name}
          </h2>

          <p className="text-zinc-400 mt-2">
            {machine.description}
          </p>

          <div className="flex items-center gap-2 mt-4">
            <div
              className={`w-3 h-3 rounded-full ${
                machine.status === "Ready"
                  ? "bg-green-500"
                  : "bg-yellow-500"
              }`}
            />

            <span className="text-sm text-zinc-300">
              {machine.status}
            </span>
          </div>
        </div>

        {/* Right */}
    
<button
  onClick={() => navigate(`/ar/${machine.id}`)}
  className="bg-cyan-500 hover:bg-cyan-600 px-6 py-3 rounded-xl font-semibold"
>
  View in AR
</button>
      </div>

      {/* Specifications */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mt-8">

        <div className="bg-zinc-800 rounded-xl p-4">
          <p className="text-zinc-400 text-sm">
            Width
          </p>

          <h3 className="text-2xl font-bold mt-1">
            {machine.width} mm
          </h3>
        </div>

        <div className="bg-zinc-800 rounded-xl p-4">
          <p className="text-zinc-400 text-sm">
            Depth
          </p>

          <h3 className="text-2xl font-bold mt-1">
            {machine.depth} mm
          </h3>
        </div>

        <div className="bg-zinc-800 rounded-xl p-4">
          <p className="text-zinc-400 text-sm">
            Height
          </p>

          <h3 className="text-2xl font-bold mt-1">
            {machine.height} mm
          </h3>
        </div>

        <div className="bg-zinc-800 rounded-xl p-4">
          <p className="text-zinc-400 text-sm">
            Model ID
          </p>

          <h3 className="text-2xl font-bold mt-1 uppercase">
            {machine.id}
          </h3>
        </div>

      </div>

    </div>
  );
}

export default InfoPanel;