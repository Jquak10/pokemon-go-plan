import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const styles =
  readFileSync(
    new URL(
      "../public/styles.css",
      import.meta.url
    ),
    "utf8"
  );

function cssBlock(
  selector
) {
  const escaped =
    selector.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\      /[.*+?^${}()|[]\\]/g,
      "\\$&"
"
    );
  const match =
    styles.match(
      new RegExp(
        escaped +
          "\\s*\\{([\\s\\S]*?)\\n\\}"
      )
    );

  assert.ok(
    match,
    `Missing CSS block for ${selector}`
  );

  return match[1];
}

function variablesFrom(
  selector
) {
  const variables = {};
  const block =
    cssBlock(
      selector
    );

  for (
    const match of
      block.matchAll(
        /(--[\w-]+):\s*([^;]+);/g
      )
  ) {
    variables[
      match[1]
    ] =
      match[2].trim();
  }

  return variables;
}

const light =
  variablesFrom(
    ":root"
  );
const dark =
  {
    ...light,
    ...variablesFrom(
      'html[data-theme="dark"]'
    )
  };

function parseColor(
  value
) {
  const normalized =
    value.trim().toLowerCase();

  if (
    normalized === "white"
  ) {
    return [
      255,
      255,
      255,
      1
    ];
  }

  const hex =
    normalized.match(
      /^#([0-9a-f]{6})$/
    );

  if (hex) {
    return [
      Number.parseInt(
        hex[1].slice(
          0,
          2
        ),
        16
      ),
      Number.parseInt(
        hex[1].slice(
          2,
          4
        ),
        16
      ),
      Number.parseInt(
        hex[1].slice(
          4,
          6
        ),
        16
      ),
      1
    ];
  }

  const rgb =
    normalized.match(
      /^rgba?\(([^)]+)\)$/
    );

  if (rgb) {
    const parts =
      rgb[1]
        .split(",")
        .map(
          part =>
            Number.parseFloat(
              part.trim()
            )
        );

    assert.ok(
      parts.length === 3 ||
        parts.length === 4,
      `Unsupported RGB color: ${value}`
    );

    return [
      parts[0],
      parts[1],
      parts[2],
      parts.length === 4
        ? parts[3]
        : 1
    ];
  }

  throw new Error(
    `Unsupported CSS color: ${value}`
  );
}

function composite(
  foreground,
  background
) {
  const alpha =
    foreground[3];
  const inverse =
    1 - alpha;

  return [
    foreground[0] *
      alpha +
      background[0] *
        inverse,
    foreground[1] *
      alpha +
      background[1] *
        inverse,
    foreground[2] *
      alpha +
      background[2] *
        inverse,
    1
  ];
}

function linearChannel(
  channel
) {
  const value =
    channel / 255;

  return value <=
    0.04045
    ? value /
        12.92
    : Math.pow(
        (value +
          0.055) /
          1.055,
        2.4
      );
}

function luminance(
  color
) {
  return (
    0.2126 *
      linearChannel(
        color[0]
      ) +
    0.7152 *
      linearChannel(
        color[1]
      ) +
    0.0722 *
      linearChannel(
        color[2]
      )
  );
}

function contrastRatio(
  foreground,
  background
) {
  const lightness =
    luminance(
      foreground
    );
  const darkness =
    luminance(
      background
    );
  const high =
    Math.max(
      lightness,
      darkness
    );
  const low =
    Math.min(
      lightness,
      darkness
    );

  return (
    (high + 0.05) /
    (low + 0.05)
  );
}

function tokenColor(
  theme,
  token
) {
  const value =
    theme[token];

  assert.ok(
    value,
    `Missing semantic token ${token}`
  );

  return parseColor(
    value
  );
}

function opaqueTokenColor(
  theme,
  token,
  backdropToken =
    "--surface"
) {
  const color =
    tokenColor(
      theme,
      token
    );

  if (
    color[3] === 1
  ) {
    return color;
  }

  return composite(
    color,
    tokenColor(
      theme,
      backdropToken
    )
  );
}

function assertTokenContrast({
  themeName,
  theme,
  foregroundToken,
  backgroundToken,
  minimum = 4.5,
  backgroundBackdrop =
    "--surface"
}) {
  const foreground =
    opaqueTokenColor(
      theme,
      foregroundToken,
      backgroundToken
    );
  const background =
    opaqueTokenColor(
      theme,
      backgroundToken,
      backgroundBackdrop
    );
  const ratio =
    contrastRatio(
      foreground,
      background
    );

  assert.ok(
    ratio >= minimum,
    `${themeName} ${foregroundToken} on ${backgroundToken} contrast ${ratio.toFixed(2)} is below ${minimum}:1`
  );
}

const textPairs = [
  [
    "--ink",
    "--surface"
  ],
  [
    "--ink-soft",
    "--surface"
  ],
  [
    "--muted",
    "--surface-soft"
  ],
  [
    "--text-subtle",
    "--surface"
  ],
  [
    "--input-placeholder",
    "--input-bg"
  ],
  [
    "--control-soft-ink",
    "--control-soft-bg"
  ],
  [
    "--success-ink",
    "--success-soft"
  ],
  [
    "--warning-ink",
    "--warning-soft"
  ],
  [
    "--danger-ink",
    "--danger-soft"
  ],
  [
    "--info-ink",
    "--info-soft"
  ],
  [
    "--violet-ink",
    "--violet-soft"
  ]
];

for (
  const [
    themeName,
    theme
  ] of [
    [
      "light",
      light
    ],
    [
      "dark",
      dark
    ]
  ]
) {
  for (
    const [
      foregroundToken,
      backgroundToken
    ] of textPairs
  ) {
    assertTokenContrast({
      themeName,
      theme,
      foregroundToken,
      backgroundToken
    });
  }

  assertTokenContrast({
    themeName,
    theme,
    foregroundToken:
      "--ink",
    backgroundToken:
      "--surface-raised"
  });

  assertTokenContrast({
    themeName,
    theme,
    foregroundToken:
      "--line-strong",
    backgroundToken:
      "--input-bg",
    minimum: 3
  });

  const focusRatio =
    contrastRatio(
      tokenColor(
        theme,
        "--go-blue"
      ),
      opaqueTokenColor(
        theme,
        "--surface"
      )
    );

  assert.ok(
    focusRatio >= 3,
    `${themeName} focus outline contrast ${focusRatio.toFixed(2)} is below 3:1`
  );

  const primaryButtonRatio =
    contrastRatio(
      parseColor(
        "white"
      ),
      tokenColor(
        theme,
        "--go-blue"
      )
    );

  assert.ok(
    primaryButtonRatio >= 4.5,
    `${themeName} primary button text contrast ${primaryButtonRatio.toFixed(2)} is below 4.5:1`
  );

  const activeTabDeepRatio =
    contrastRatio(
      parseColor(
        "white"
      ),
      tokenColor(
        theme,
        "--go-blue-deep"
      )
    );

  assert.ok(
    activeTabDeepRatio >= 4.5,
    `${themeName} selected navigation dark gradient endpoint contrast ${activeTabDeepRatio.toFixed(2)} is below 4.5:1`
  );
}

assert.match(
  styles,
  /button:disabled\s*\{[\s\S]*?opacity:\s*0\.55/,
  "Disabled controls must retain an explicit visual state"
);
assert.match(
  styles,
  /\.manage-page[\s\S]*?:focus-visible\s*\{[\s\S]*?outline:\s*3px solid var\(--go-blue\)/,
  "Keyboard focus must retain a visible high-contrast outline"
);

console.log(
  "theme accessibility contrast checks passed"
);
