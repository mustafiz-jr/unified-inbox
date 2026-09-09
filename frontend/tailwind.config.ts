// tailwind.config.ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      screens: {
        xs: "375px",
        md: "768px",
        lg: "1280px",
      },
      colors: {
        primary: "#249D8F",
        secondary: "#ffa229",
        accent: "#E76F51",
        surface: "#FDF0D5",
        text: "#1D2128",
        border: "#DCD3B8",
      },
    },
  },
  plugins: [],
};

export default config;