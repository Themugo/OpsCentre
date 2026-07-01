/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          light: "#E1F5EE",   // alias used throughout components
          50:    "#E1F5EE",
          100:   "#9FE1CB",
          200:   "#5DC9A8",
          300:   "#2DB88A",
          500:   "#1D9E75",
          600:   "#0F6E56",
          700:   "#085041",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
