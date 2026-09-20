/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gov: {
          bg: '#0a0f1d',
          card: '#111827',
          cardLight: '#1e293b',
          border: '#1e293b',
          borderLight: '#334155',
          navy: {
            DEFAULT: '#0f172a',
            50: '#f8fafc',
            100: '#f1f5f9',
            200: '#e2e8f0',
            300: '#cbd5e1',
            400: '#94a3b8',
            500: '#64748b',
            600: '#475569',
            700: '#334155',
            800: '#1e293b',
            900: '#0f172a',
            950: '#020617',
          },
          blue: {
            DEFAULT: '#2563eb',
            light: '#3b82f6',
            dark: '#1d4ed8',
            glow: 'rgba(37, 99, 235, 0.25)',
          },
          emerald: {
            DEFAULT: '#10b981',
            light: '#34d399',
            dark: '#059669',
            glow: 'rgba(16, 185, 129, 0.25)',
          },
          amber: {
            DEFAULT: '#f59e0b',
            light: '#fbbf24',
            dark: '#d97706',
            glow: 'rgba(245, 158, 11, 0.25)',
          },
          rose: {
            DEFAULT: '#ef4444',
            light: '#f87171',
            dark: '#dc2626',
            glow: 'rgba(239, 68, 68, 0.25)',
          }
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'ping-slow': 'ping 2s cubic-bezier(0, 0, 0.2, 1) infinite',
      }
    },
  },
  plugins: [],
}
