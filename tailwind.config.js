/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        vault: {
          bg: "#0C0E14",
          surface: "#13161F",
          border: "#1E2230",
          accent: "#5B6CFF",
          "accent-dim": "#3D4FCC",
          muted: "#3A3F52",
          text: "#E8EAF2",
          "text-dim": "#7B82A0",
          green: "#2ECC8A",
          amber: "#F0A500",
          red: "#E05252",
        },
      },
      fontFamily: {
        mono: ["'IBM Plex Mono'", "monospace"],
        sans: ["'Inter'", "sans-serif"],
      },
    },
  },
  plugins: [],
};
