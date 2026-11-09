import { Droplets, Zap, TrainFront } from "lucide-react";
export function PlantDiagram({
  compact = false,
  category = "water",
}: {
  compact?: boolean;
  category?: "water" | "power" | "rail";
}) {
  if (category !== "water")
    return (
      <div className={`system-illustration ${category}`} aria-hidden="true">
        {category === "power" ? (
          <>
            <div className="power-tower tower-left" />
            <div className="power-tower tower-right" />
            <div className="substation-block">
              <Zap size={30} />
            </div>
            <div className="power-wire wire-a" />
            <div className="power-wire wire-b" />
          </>
        ) : (
          <>
            <div className="rail-track rail-a" />
            <div className="rail-track rail-b" />
            <div className="train-block">
              <TrainFront size={39} />
              <span>07</span>
            </div>
            <div className="signal-post">
              <i />
              <i />
            </div>
          </>
        )}
        <span className="diagram-coordinates">
          {category === "power" ? "SUBSTATION // 02" : "OPERATIONS // 03"}
        </span>
      </div>
    );
  return (
    <div
      className={`plant-diagram ${compact ? "compact" : ""}`}
      role="img"
      aria-label="七王子市中央浄水場の模擬処理フロー：取水からろ過、配水まで"
    >
      <svg viewBox="0 0 600 290" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern
            id={compact ? "grid-small" : "grid-large"}
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <path d="M 24 0 L 0 0 0 24" stroke="#394145" strokeWidth=".6" />
          </pattern>
          <linearGradient
            id={compact ? "water-small" : "water-large"}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop stopColor="#43b2ba" stopOpacity=".24" />
            <stop offset="1" stopColor="#43b2ba" stopOpacity=".04" />
          </linearGradient>
        </defs>
        <rect
          width="600"
          height="290"
          fill={`url(#${compact ? "grid-small" : "grid-large"})`}
        />
        <g transform="translate(15 4)">
          <path
            d="M30 180H104V126H204V192H293V142H404V179H552"
            stroke="#3b6970"
            strokeWidth="7"
          />
          <path
            className="flow-path"
            d="M30 180H104V126H204V192H293V142H404V179H552"
            stroke="#6bc9cc"
            strokeWidth="2"
            strokeDasharray="5 8"
          />
          <g stroke="#7a8c91" strokeWidth="1.3">
            <path
              d="M53 157V208Q53 225 91 225Q129 225 129 208V157"
              fill="#222d31"
            />
            <ellipse cx="91" cy="157" rx="38" ry="12" fill="#28363a" />
            <path
              d="M54 181Q91 199 128 181V207Q91 230 54 207Z"
              fill={`url(#${compact ? "water-small" : "water-large"})`}
              stroke="#4c9199"
            />
            <path d="M54 188Q91 205 128 188" stroke="#50a9b3" />
            <path
              d="M179 90V145Q179 162 216 162Q253 162 253 145V90"
              fill="#222d31"
            />
            <ellipse cx="216" cy="90" rx="37" ry="12" fill="#28363a" />
            <path
              d="M180 112Q216 129 252 112V144Q216 166 180 144Z"
              fill={`url(#${compact ? "water-small" : "water-large"})`}
              stroke="#4c9199"
            />
            <path d="M180 124Q216 141 252 124" stroke="#50a9b3" />
            <path
              d="M323 127L369 104L422 131V190L375 213L323 187Z"
              fill="#283337"
            />
            <path d="M323 127L375 153L422 131M375 153V213" />
            <path
              d="M332 151L364 166V185L332 169ZM386 167L412 154V175L386 188Z"
              stroke="#4f8a92"
              fill="#28444a"
            />
            <path
              d="M479 125V196Q479 212 513 212Q547 212 547 196V125"
              fill="#222d31"
            />
            <ellipse cx="513" cy="125" rx="34" ry="11" fill="#28363a" />
            <path
              d="M480 155Q513 171 546 155V195Q513 216 480 195Z"
              stroke="#4c9199"
              fill={`url(#${compact ? "water-small" : "water-large"})`}
            />
            <path d="M480 168Q513 183 546 168" stroke="#50a9b3" />
            <path
              d="M216 78V49H375V106M375 49V33M513 112V76H375"
              stroke="#d19b68"
              strokeDasharray="4 4"
            />
            <rect
              x="343"
              y="11"
              width="64"
              height="29"
              rx="3"
              fill="#303734"
              stroke="#bd936d"
            />
          </g>
          <g fill="#9aabb0" fontSize="10" fontFamily="monospace">
            <text x="63" y="252">
              01 INTAKE
            </text>
            <text x="181" y="186">
              02 FILTER
            </text>
            <text x="337" y="239">
              03 CONTROL
            </text>
            <text x="477" y="240">
              04 SUPPLY
            </text>
            <text x="359" y="30" fill="#d1ab88">
              PLC-01
            </text>
          </g>
          <g fill="#e8a765">
            <circle cx="216" cy="49" r="3" />
            <circle cx="513" cy="76" r="3" />
          </g>
          <g fill="#74b7b8">
            <circle cx="151" cy="126" r="3" />
            <circle cx="460" cy="179" r="3" />
          </g>
        </g>
      </svg>
      {!compact && (
        <div className="diagram-caption">
          <Droplets size={13} />
          <span>七王子市中央浄水場</span>
          <span>SIMULATED TOPOLOGY</span>
        </div>
      )}
    </div>
  );
}
