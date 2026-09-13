
/**
 * Mercado Livre logo (handshake in yellow circle) – SVG inline component.
 * Usage: <MLIcon size={16} />
 */
export function MLIcon({ size = 16, className = '' }: { size?: number; className?: string }) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            className={className}
            xmlns="http://www.w3.org/2000/svg"
        >
            {/* Yellow circle background */}
            <circle cx="50" cy="50" r="50" fill="#FFE600" />

            {/* Blue outer ring */}
            <circle cx="50" cy="50" r="44" fill="none" stroke="#2D3277" strokeWidth="5" />

            {/* Handshake - simplified faithful version */}
            {/* Left hand */}
            <g stroke="#2D3277" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none">
                {/* Left arm/sleeve */}
                <path d="M12 62 C18 58 24 54 30 52 L38 50" />
                {/* Left fingers */}
                <path d="M38 50 C40 44 44 42 48 44 L52 46" />
                <path d="M44 42 C45 37 48 35 51 37" />
                <path d="M49 36 C50 31 53 30 55 32" />
                <path d="M54 31 C55 27 58 27 59 30" />

                {/* Handshake join */}
                <path d="M52 46 C56 44 62 44 66 48 L72 52" />

                {/* Right fingers */}
                <path d="M55 32 C60 30 66 30 68 36" />
                <path d="M59 30 C63 27 68 28 69 33" />

                {/* Right arm */}
                <path d="M66 48 C70 46 76 50 88 58" />

                {/* Sleeve cuffs */}
                <path d="M10 65 C14 60 20 58 26 60" />
                <path d="M82 60 C86 58 90 60 92 65" />
            </g>
        </svg>
    );
}
