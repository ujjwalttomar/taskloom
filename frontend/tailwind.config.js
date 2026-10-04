/** @type {import('tailwindcss').Config} */
export default {
    content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
    theme: {
        extend: {
            colors: {
                bg: "#0a0a0f",
                surface: "#13131a",
                elevated: "#1c1c28",
                border: "rgba(255,255,255,0.07)",
                accent: "#6366f1",
                "accent-hover": "#4f46e5",
            },
            fontFamily: {
                sans: ["Inter", "system-ui", "sans-serif"],
            },
        },
    },
    plugins: [],
};
