function Header() {
  return (
    <header className="h-16 bg-zinc-900 border-b border-zinc-800 px-6 flex items-center justify-between">

      <h1 className="text-2xl font-bold text-cyan-400">
        Brewmac AR
      </h1>

      <button className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-600 transition">
        About
      </button>

    </header>
  );
}

export default Header;