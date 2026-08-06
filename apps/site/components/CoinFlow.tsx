export function CoinFlow() {
  return (
    <svg
      viewBox="0 0 760 220"
      className="h-auto w-full"
      aria-hidden="true"
      fill="none"
    >
      <defs>
        <linearGradient id="flow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#e8b34b" stopOpacity="0.35" />
          <stop offset="55%" stopColor="#e8b34b" />
          <stop offset="100%" stopColor="#6ea8ff" stopOpacity="0.7" />
        </linearGradient>
      </defs>

      <path
        d="M150 110 H 250 M 380 110 H 470"
        stroke="url(#flow)"
        strokeWidth="2"
        strokeDasharray="3 8"
        strokeLinecap="round"
      />

      <g stroke="#e8b34b">
        <circle cx="105" cy="110" r="34" strokeWidth="2" />
        <circle cx="105" cy="110" r="24" strokeWidth="1" strokeOpacity="0.45" />
      </g>
      <text
        x="105"
        y="118"
        textAnchor="middle"
        fill="#e8b34b"
        fontFamily="var(--font-mono)"
        fontSize="22"
      >
        P
      </text>

      <g stroke="#6ea8ff">
        <circle
          cx="300"
          cy="110"
          r="15"
          fill="#6ea8ff"
          fillOpacity="0.15"
          strokeWidth="1.5"
        />
        <circle
          cx="338"
          cy="110"
          r="15"
          fill="#6ea8ff"
          fillOpacity="0.28"
          strokeWidth="1.5"
        />
        <circle
          cx="376"
          cy="110"
          r="15"
          fill="#6ea8ff"
          fillOpacity="0.42"
          strokeWidth="1.5"
        />
      </g>

      <ellipse
        cx="620"
        cy="110"
        rx="78"
        ry="66"
        fill="#e8b34b"
        fillOpacity="0.05"
      />

      <g stroke="#e8b34b">
        <rect x="560" y="62" width="120" height="96" rx="12" strokeWidth="2" />
        <rect
          x="572"
          y="52"
          width="96"
          height="12"
          rx="4"
          strokeWidth="1.5"
          strokeOpacity="0.7"
        />
        <circle cx="620" cy="110" r="18" strokeWidth="1.5" />
        <circle cx="620" cy="110" r="5" fill="#e8b34b" strokeWidth="0" />
      </g>
      <text
        x="620"
        y="180"
        textAnchor="middle"
        fill="#e8b34b"
        fontFamily="var(--font-mono)"
        fontSize="11"
        letterSpacing="2"
      >
        VAULT
      </text>
      <text
        x="620"
        y="196"
        textAnchor="middle"
        fill="#5d6b80"
        fontFamily="var(--font-mono)"
        fontSize="10"
      >
        NAV ▲
      </text>
    </svg>
  );
}
