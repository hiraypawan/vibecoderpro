// ─── Design Theme System ────────────────────────────────────────────────────
// Each request picks ONE theme. The theme dictates the visual language:
// palette, typography, layout pattern, decorative motifs, motion style.
// This prevents every AI output from looking identical.

export interface DesignTheme {
  id: string;
  name: string;
  vibe: string;
  palette: {
    bg: string;
    surface: string;
    surfaceAlt: string;
    text: string;
    textMuted: string;
    accent: string;
    accentAlt: string;
    border: string;
  };
  fonts: {
    display: string;
    body: string;
    mono?: string;
    googleFontsUrl: string;
  };
  layout: string;
  motifs: string[];
  motion: string;
  cssVariables: string;
  layoutRules: string;
  avoid: string[];
}

const GOOGLE = (families: string[]) =>
  `https://fonts.googleapis.com/css2?family=${families.map((f) => f.replace(/ /g, '+')).join('&family=')}&display=swap`;

export const DESIGN_THEMES: DesignTheme[] = [
  {
    id: 'brutalist',
    name: 'Brutalist / Raw',
    vibe: 'Bold, confrontational, deliberately ugly-beautiful. Thick borders, harsh shadows, monospace headings, raw HTML feel.',
    palette: { bg: '#f4f1ea', surface: '#ffffff', surfaceAlt: '#000000', text: '#0a0a0a', textMuted: '#444444', accent: '#ff3300', accentAlt: '#0066ff', border: '#0a0a0a' },
    fonts: { display: 'Space Grotesk', body: 'Inter', mono: 'JetBrains Mono', googleFontsUrl: GOOGLE(['Space+Grotesk:wght@500;700', 'Inter:wght@400;600', 'JetBrains+Mono:wght@400;700']) },
    layout: 'Asymmetric, oversized typography, off-grid blocks, exposed grid lines, sticky elements at strange angles.',
    motifs: ['Thick 3-4px black borders', 'Hard offset box-shadows (8px 8px 0 #000)', 'Numbered sections like "01 / 04"', 'Underlined links', 'Strikethrough on old prices', 'Marquee scrollers', 'Big rotated badges', 'Emoji or █ characters as decoration'],
    motion: 'Snappy, no easing. 0ms or 50ms. transform: translate only. No fade-ins. Hover = invert colors instantly.',
    cssVariables: `--bg: #f4f1ea; --surface: #fff; --ink: #0a0a0a; --accent: #ff3300; --accent2: #0066ff; --border-w: 3px; --shadow: 8px 8px 0 #0a0a0a;`,
    layoutRules: 'Use a 12-col grid with visible gap lines. Hero text fills 9 columns and breaks out of bounds. Cards have NO border-radius (sharp 0px). Buttons are rectangular with the offset shadow.',
    avoid: ['Soft shadows', 'border-radius', 'gradients', 'subtle transitions'],
  },
  {
    id: 'glassmorphism',
    name: 'Glassmorphism / Aurora',
    vibe: 'Ethereal, dreamy, layered. Frosted glass panels floating over animated gradient orbs.',
    palette: { bg: '#0f0c29', surface: 'rgba(255,255,255,0.08)', surfaceAlt: 'rgba(255,255,255,0.04)', text: '#ffffff', textMuted: 'rgba(255,255,255,0.65)', accent: '#a78bfa', accentAlt: '#f472b6', border: 'rgba(255,255,255,0.18)' },
    fonts: { display: 'Manrope', body: 'Manrope', googleFontsUrl: GOOGLE(['Manrope:wght@300;500;700;800']) },
    layout: 'Centered, breathable. Large hero with floating glass cards. Sections separated by negative space, not borders.',
    motifs: ['Animated gradient orbs in background (3-4 absolute-positioned blurs)', 'backdrop-filter: blur(20px)', '1px translucent white borders', 'Soft white glows on hover', 'Circular avatar masks', 'Subtle noise texture overlay', 'Tag chips with translucent backgrounds'],
    motion: 'Slow, liquid. 600-800ms cubic-bezier. Orbs drift across the screen via @keyframes. Cards lift on hover with a glow trail.',
    cssVariables: `--bg: #0f0c29; --orb1: #ff6ec4; --orb2: #7873f5; --orb3: #4ade80; --glass: rgba(255,255,255,0.08); --glass-border: rgba(255,255,255,0.18); --text: #fff; --muted: rgba(255,255,255,0.65);`,
    layoutRules: 'Fixed background with 3 absolutely positioned 600px gradient orbs that drift. Content sits on top in glass panels. Every card has backdrop-filter blur.',
    avoid: ['Hard edges', 'black backgrounds', 'Sharp typography', 'Heavy borders'],
  },
  {
    id: 'editorial',
    name: 'Editorial / Magazine',
    vibe: 'Long-form, literary, sophisticated. Serif headlines, generous margins, drop caps, pull quotes, like The New Yorker or Vogue.',
    palette: { bg: '#faf7f2', surface: '#ffffff', surfaceAlt: '#1a1a1a', text: '#1a1a1a', textMuted: '#5a5a5a', accent: '#8b1a1a', accentAlt: '#c79b3d', border: '#e5dfd3' },
    fonts: { display: 'Playfair Display', body: 'Lora', mono: 'IBM Plex Mono', googleFontsUrl: GOOGLE(['Playfair+Display:wght@400;700;900', 'Lora:wght@400;500;600', 'IBM+Plex+Mono:wght@400;500']) },
    layout: 'Magazine grid. Hero is a large image+headline. Content flows in 1-2 narrow columns. Pull quotes break out. Captions in italic.',
    motifs: ['Drop caps on first paragraph (4-line float)', 'Small caps eyebrow text', 'Thin horizontal rules (1px #e5dfd3)', 'Pull quotes in oversized italic serif', 'Image+caption pairs', 'Roman numeral section markers (I, II, III)', 'Byline + date in mono', 'Margin notes in narrow gutter'],
    motion: 'Subtle. 200ms ease. Mostly scroll-triggered fade-ins. No bounce. Hover: slight letter-spacing increase on links.',
    cssVariables: `--bg: #faf7f2; --ink: #1a1a1a; --rule: #e5dfd3; --accent: #8b1a1a; --gold: #c79b3d; --measure: 68ch;`,
    layoutRules: 'Body text max-width 68ch, centered. Hero is a 2-column layout: 60% image, 40% headline. Section dividers are full-width 1px rules with the section number centered.',
    avoid: ['Bouncy animations', 'bright colors', 'sans-serif headings', 'blocky buttons'],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk / Neon',
    vibe: 'High-tech, dystopian, electric. Hot pink and cyan, scan lines, glitch effects, monospace.',
    palette: { bg: '#0a0014', surface: '#14002a', surfaceAlt: '#1f0033', text: '#e0e0ff', textMuted: '#9090c0', accent: '#ff006e', accentAlt: '#00f5ff', border: '#ff006e' },
    fonts: { display: 'Orbitron', body: 'Rajdhani', mono: 'Share Tech Mono', googleFontsUrl: GOOGLE(['Orbitron:wght@500;700;900', 'Rajdhani:wght@400;500;600;700', 'Share+Tech+Mono']) },
    layout: 'Angular, diagonal. Use clip-path for slanted sections. Buttons have chamfered corners.',
    motifs: ['Scan line overlay (repeating linear-gradient)', 'Glitch text effect (text-shadow with offset duplicates)', 'Neon glow box-shadow (0 0 20px #ff006e)', 'Terminal-style code blocks', 'Corner brackets [ ] and angle quotes 〈 〉', 'Hex grids', 'Animated cursors blinking', 'HUD-style frames'],
    motion: 'Aggressive. Glitch animations. Hue rotation on idle. Text-shadow pulse. 100-300ms snap transitions. Marquee text.',
    cssVariables: `--bg: #0a0014; --neon-pink: #ff006e; --neon-cyan: #00f5ff; --neon-purple: #b026ff; --text: #e0e0ff; --muted: #9090c0; --grid: rgba(255,0,110,0.1);`,
    layoutRules: 'Background has a subtle hex/grid pattern. Use clip-path: polygon() for slanted sections. All text has slight text-shadow glow matching the accent color.',
    avoid: ['Soft pastels', 'serif fonts', 'rounded everything', 'minimalism'],
  },
  {
    id: 'swiss',
    name: 'Swiss / International',
    vibe: 'Objective, precise, grid-driven. Helvetica-style sans, lots of whitespace, asymmetric balance. Like Massimo Vignelli or Müller-Brockmann.',
    palette: { bg: '#fafafa', surface: '#ffffff', surfaceAlt: '#f0f0f0', text: '#0a0a0a', textMuted: '#666666', accent: '#e63946', accentAlt: '#1d3557', border: '#0a0a0a' },
    fonts: { display: 'Helvetica Neue', body: 'Inter', mono: 'JetBrains Mono', googleFontsUrl: GOOGLE(['Inter:wght@400;500;700;900', 'JetBrains+Mono:wght@400;700']) },
    layout: 'Strict 12-col grid. Heavy use of negative space. Off-baseline alignment. Numbered annotations.',
    motifs: ['Large numerical markers (01, 02, 03)', 'Thin 1px black lines everywhere', 'Geometric shapes (circles, squares) as accents', 'Justified text', 'Footer with full legal micro-text', 'Helvetica at very large or very small sizes', 'Asymmetric image placement'],
    motion: 'None or extremely minimal. 100ms linear. No easing. No bounce. Hover = background color flip only.',
    cssVariables: `--bg: #fafafa; --ink: #0a0a0a; --rule: #0a0a0a; --accent: #e63946; --navy: #1d3557; --measure: 60ch;`,
    layoutRules: 'Visible 12-col grid lines (subtle 1px #eee). Content rarely fills the whole row — leave 30-50% empty. Numbers and metadata in mono, large headlines in bold sans.',
    avoid: ['Gradients', 'shadows', 'rounded corners', 'multiple colors', 'decorative imagery'],
  },
  {
    id: 'playful',
    name: 'Playful / Cartoon',
    vibe: 'Friendly, bouncy, hand-drawn. Pastels, big shapes, smiling illustrations, generous use of emoji.',
    palette: { bg: '#fff4e6', surface: '#ffe5d9', surfaceAlt: '#ffd6a5', text: '#2d1b0e', textMuted: '#7c5a3a', accent: '#ff6b35', accentAlt: '#f7b801', border: '#2d1b0e' },
    fonts: { display: 'Fredoka', body: 'Nunito', googleFontsUrl: GOOGLE(['Fredoka:wght@500;600;700', 'Nunito:wght@400;600;800']) },
    layout: 'Bento grid with mixed-size cards. Cards have personality — some tilted, some popping out.',
    motifs: ['Sticker-style rotated cards (rotate(-3deg))', 'Squiggly underlines (SVG wave)', 'Big emoji icons (🚀🎨✨)', 'Speech bubbles for testimonials', 'Polka dot or stripe patterns', 'Hand-drawn arrows', 'Stamp-style badges', 'Wobble animation on hover'],
    motion: 'Bouncy! cubic-bezier(0.68, -0.55, 0.27, 1.55). Cards wobble on hover. Buttons squish on click. Scroll-triggered pop-in animations.',
    cssVariables: `--bg: #fff4e6; --cream: #ffe5d9; --peach: #ffd6a5; --ink: #2d1b0e; --tangerine: #ff6b35; --sun: #f7b801; --mint: #80ed99; --sky: #a0c4ff;`,
    layoutRules: 'Bento grid with cards of varying sizes (1x1, 2x1, 1x2). All cards have thick (3-4px) borders in dark brown, with 8px offset shadow. Slight rotation on some cards for hand-placed feel.',
    avoid: ['Dark themes', 'monospace fonts', 'serious/minimal styling', 'sharp angular designs'],
  },
  {
    id: 'terminal',
    name: 'Terminal / Hacker',
    vibe: 'Code editor meets hacker manifesto. Green-on-black, ASCII art, monospace everywhere, command-line aesthetic.',
    palette: { bg: '#0a0a0a', surface: '#000000', surfaceAlt: '#1a1a1a', text: '#00ff41', textMuted: '#008f24', accent: '#00ff41', accentAlt: '#ffb000', border: '#00ff41' },
    fonts: { display: 'Fira Code', body: 'Fira Code', mono: 'Fira Code', googleFontsUrl: GOOGLE(['Fira+Code:wght@400;500;700']) },
    layout: 'Single-column, narrow. Everything looks like terminal output. No images, all ASCII and text.',
    motifs: ['$ command prompt prefixes', 'Blinking cursor (animation: blink 1s step-end infinite)', 'ASCII art headers (using block characters ▀▄█)', 'Box-drawing characters for separators (─ │ ┌ ┐ └ ┘)', 'Cat / Less / Grep command demos', 'Timestamp prefixes [2026-01-15 14:32:01]', 'Error messages styled as red ✗', 'Success as green ✓', 'Loading animations [...   ] -> [..  ]'],
    motion: 'Typewriter effect on hero. Cursor blinks. Text appears line by line. No fades, no slides.',
    cssVariables: `--bg: #0a0a0a; --term: #000; --green: #00ff41; --green-dim: #008f24; --amber: #ffb000; --red: #ff3333; --blue: #00bfff;`,
    layoutRules: 'Max-width 900px, centered. Everything is text. Use box-drawing characters for section dividers. Prompts look like real terminal sessions with $ at the start of "commands".',
    avoid: ['Images', 'gradients', 'multiple colors', 'rounded anything', 'emojis'],
  },
  {
    id: 'organic',
    name: 'Organic / Earthy',
    vibe: 'Natural, calm, sustainable. Earth tones, soft curves, asymmetric blob shapes, plant-like.',
    palette: { bg: '#f5f0e8', surface: '#ede5d3', surfaceAlt: '#d9c9a8', text: '#2d3a1f', textMuted: '#5a6b3f', accent: '#7a8450', accentAlt: '#c97b4a', border: '#a89878' },
    fonts: { display: 'Fraunces', body: 'DM Sans', googleFontsUrl: GOOGLE(['Fraunces:wght@400;500;700;900', 'DM+Sans:wght@400;500;700']) },
    layout: 'Asymmetric, flowing. Use SVG blob shapes as section backgrounds. Organic curves everywhere.',
    motifs: ['Blob SVG shapes behind content (border-radius: 30% 70% 70% 30% / 30% 30% 70% 70%)', 'Hand-drawn line illustrations (use SVG)', 'Leaf, branch, dot patterns', 'Curved text along paths (if possible)', 'Watercolor-style background gradients', 'Sticker-like circular badges', 'Mushroom/cloud illustrations'],
    motion: 'Gentle drift. 800-1000ms ease-in-out. Blobs float around slowly. Fade-in on scroll, no translate.',
    cssVariables: `--bg: #f5f0e8; --sand: #ede5d3; --clay: #d9c9a8; --moss: #7a8450; --terracotta: #c97b4a; --bark: #2d3a1f;`,
    layoutRules: 'Sections have SVG blob backgrounds in muted tones. Cards have very large border-radius (40px+) for soft feel. No straight horizontal lines — use subtle waves or skip dividers entirely.',
    avoid: ['Neon colors', 'sharp angles', 'monospace', 'dark themes', 'tech vibes'],
  },
  {
    id: 'luxury',
    name: 'Luxury / Serif',
    vibe: 'Premium, exclusive, quiet. Black + gold + cream, refined serif typography, generous whitespace.',
    palette: { bg: '#0a0a0a', surface: '#1a1a1a', surfaceAlt: '#000000', text: '#f5f0e8', textMuted: '#a89878', accent: '#c9a961', accentAlt: '#8b6f47', border: '#3a2f1f' },
    fonts: { display: 'Cormorant Garamond', body: 'Lato', googleFontsUrl: GOOGLE(['Cormorant+Garamond:wght@300;400;500;600;700', 'Lato:wght@300;400;700']) },
    layout: 'Centered, narrow, generous margins. Asymmetric hero with massive headline and lots of black space.',
    motifs: ['Thin gold hairlines (1px solid #c9a961)', 'Drop caps in gold', 'Tracking: 0.3em on small caps eyebrows', 'Centered monogram logos (MV, AT)', 'Engraved-looking dividers (◆───◆)', 'Numbers in serif italic', 'Watermarks / wax seal vibes', 'All-caps for nav with letter-spacing'],
    motion: 'Slow and elegant. 800-1200ms cubic-bezier(0.4, 0, 0.2, 1). Subtle parallax. No bouncy.',
    cssVariables: `--bg: #0a0a0a; --ink: #1a1a1a; --cream: #f5f0e8; --gold: #c9a961; --bronze: #8b6f47; --rule: #3a2f1f;`,
    layoutRules: 'Centered layouts with max-width 1100px. Generous padding (6rem+ between sections). Always 50%+ of the page is empty space. No more than 2 typefaces.',
    avoid: ['Bright colors', 'casual fonts', 'multiple colors', 'bouncy animations', 'busy backgrounds'],
  },
  {
    id: 'bento',
    name: 'Bento Grid',
    vibe: 'Apple-style product pages. Mixed-size cards in a tight grid, each card a different content type, generous internal padding.',
    palette: { bg: '#f5f5f7', surface: '#ffffff', surfaceAlt: '#e8e8ed', text: '#1d1d1f', textMuted: '#6e6e73', accent: '#0071e3', accentAlt: '#bf4800', border: '#d2d2d7' },
    fonts: { display: 'SF Pro Display', body: 'Inter', googleFontsUrl: GOOGLE(['Inter:wght@400;500;600;700;800']) },
    layout: 'Strict bento grid. Mix of 1x1, 1x2, 2x1, 2x2 cards. Tight gaps. Each card is self-contained.',
    motifs: ['Mixed-size cards in asymmetric grid', 'Each card has unique background color from a soft palette', 'Large numerical stats in some cards', 'Image+text pairs', 'Icon+label chips', 'Subtle inner shadows on cards', 'Card with single big quote', 'Card with a small product mockup'],
    motion: 'Subtle Apple-style. 200ms ease-out. Hover: lift 4px and subtle shadow. Scroll-triggered fade-in.',
    cssVariables: `--bg: #f5f5f7; --card: #fff; --card-2: #e8e8ed; --ink: #1d1d1f; --muted: #6e6e73; --blue: #0071e3; --orange: #bf4800; --rule: #d2d2d7;`,
    layoutRules: 'CSS Grid with explicit grid-template-areas defining the bento layout. Gaps 12px. Cards have 24-32px internal padding. Mix of card colors from a 4-color soft palette.',
    avoid: ['Centered hero text', 'long scrolling sections', 'decorative borders', 'multiple accent colors in same card'],
  },
  {
    id: 'retro',
    name: 'Retro 80s / Synthwave',
    vibe: 'Sunset gradients, palm trees, grid lines stretching to horizon, neon pink/purple/cyan, like a Miami Vice VHS cover.',
    palette: { bg: '#1a0033', surface: '#2d0052', surfaceAlt: '#0a0014', text: '#fff5e1', textMuted: '#ff9ed8', accent: '#ff006e', accentAlt: '#00f0ff', border: '#ff006e' },
    fonts: { display: 'Audiowide', body: 'VT323', mono: 'VT323', googleFontsUrl: GOOGLE(['Audiowide', 'VT323']) },
    layout: 'Hero is a horizon line with grid stretching to it. Sun is a horizontal-striped circle. Sections are framed by neon outlines.',
    motifs: ['Sunset gradient (orange→pink→purple→navy)', 'Perspective grid floor in hero (CSS transform)', 'Horizontal-striped sun (linear-gradient stripes)', 'Palm tree silhouettes (SVG)', 'Chrome text effect (gradient + text-shadow)', 'Scan lines overlay', 'VHS chromatic aberration (text-shadow offset RGB)', 'Pixelated cursor'],
    motion: 'Synth-driven. Grid scrolls toward viewer. Sun pulses. Text glows and flickers. 80s-style power-on effect for hero.',
    cssVariables: `--bg: #1a0033; --sun-orange: #ff8c00; --sun-pink: #ff006e; --sun-purple: #8b00ff; --neon-cyan: #00f0ff; --grid: #ff00ff;`,
    layoutRules: 'Hero has perspective grid floor (CSS gradient with transform: perspective(800px) rotateX(60deg)). Sun is a circle with horizontal stripes via background. Use chrome text effect on the main headline.',
    avoid: ['Muted colors', 'minimalist design', 'serious corporate vibes'],
  },
  {
    id: 'soft',
    name: 'Soft / Pastel SaaS',
    vibe: 'Friendly SaaS, approachable. Pastel gradients, soft shadows, large rounded corners, gentle motion.',
    palette: { bg: '#fafbff', surface: '#ffffff', surfaceAlt: '#f0f4ff', text: '#1a1a2e', textMuted: '#5a5a7a', accent: '#6366f1', accentAlt: '#ec4899', border: '#e0e0ff' },
    fonts: { display: 'Plus Jakarta Sans', body: 'Plus Jakarta Sans', googleFontsUrl: GOOGLE(['Plus+Jakarta+Sans:wght@400;500;600;700;800']) },
    layout: 'Centered, balanced. Hero with 2 columns: text on left, illustration on right. Cards in 3-col grid.',
    motifs: ['Soft pastel gradient blobs in background', '16-24px border-radius on everything', 'Subtle gradient borders (1px solid transparent; background: linear-gradient + padding-box trick)', 'Icon chips with colored backgrounds', 'Avatars with colored ring', 'Feature icons in colored squares with rounded corners', 'Soft drop shadows: 0 4px 24px rgba(0,0,0,0.06)'],
    motion: 'Gentle. 300ms ease-out. Subtle hover lifts. Smooth scroll. No bouncy or aggressive animations.',
    cssVariables: `--bg: #fafbff; --surface: #fff; --lavender: #6366f1; --pink: #ec4899; --sky: #38bdf8; --mint: #10b981; --ink: #1a1a2e; --muted: #5a5a7a; --rule: #e0e0ff;`,
    layoutRules: 'Centered max-width 1200px. Hero is 2-col grid: text 50%, illustration 50%. Background has 2-3 large blurred gradient orbs. All cards have 16-24px border-radius.',
    avoid: ['Dark themes', 'neon colors', 'sharp angular designs', 'aggressive motion'],
  },
];

// Pick a theme for a request. If the request mentions a specific style, prefer
// matching themes; otherwise random.
export function pickTheme(requestHint?: string): DesignTheme {
  if (!requestHint) return DESIGN_THEMES[Math.floor(Math.random() * DESIGN_THEMES.length)];

  const hint = requestHint.toLowerCase();
  const matches = DESIGN_THEMES.filter((t) => {
    const keywords: Record<string, string[]> = {
      brutalist: ['brutal', 'raw', 'punk', 'bold', 'harsh'],
      glassmorphism: ['glass', 'frosted', 'aurora', 'ethereal', 'dream'],
      editorial: ['editorial', 'magazine', 'newspaper', 'literary', 'blog', 'article', 'story'],
      cyberpunk: ['cyber', 'neon', 'hacker', 'tech', 'futuristic', 'glow'],
      swiss: ['swiss', 'minimal', 'clean', 'corporate', 'objective', 'modernist'],
      playful: ['playful', 'kids', 'fun', 'cartoon', 'bouncy', 'birthday', 'kids'],
      terminal: ['terminal', 'cli', 'command', 'code', 'developer', 'tool'],
      organic: ['organic', 'natural', 'eco', 'sustainable', 'plant', 'wellness', 'spa'],
      luxury: ['luxury', 'premium', 'exclusive', 'high-end', 'elegant', 'fashion', 'jewelry'],
      bento: ['bento', 'apple', 'product', 'showcase', 'feature grid'],
      retro: ['retro', '80s', '90s', 'synth', 'vapor', 'vhs', 'neon retro'],
      soft: ['soft', 'pastel', 'friendly', 'saas', 'startup', 'app', 'modern app'],
    };
    return (keywords[t.id] || []).some((k) => hint.includes(k));
  });
  if (matches.length > 0) return matches[Math.floor(Math.random() * matches.length)];
  return DESIGN_THEMES[Math.floor(Math.random() * DESIGN_THEMES.length)];
}

export function themeToPromptBlock(theme: DesignTheme): string {
  return `THEME: ${theme.name} — ${theme.vibe}

PALETTE (use these CSS variables):
${theme.cssVariables}

TYPOGRAPHY (load from Google Fonts in HTML <head>):
${theme.fonts.googleFontsUrl}
- Display/headings: ${theme.fonts.display} (weights 600-900)
- Body: ${theme.fonts.body} (weights 400-600)
${theme.fonts.mono ? `- Mono: ${theme.fonts.mono} (use for code, timestamps, monospace UI)` : ''}

LAYOUT: ${theme.layout}

MOTIFS (use these to make it feel authentic):
${theme.motifs.map((m) => `- ${m}`).join('\n')}

MOTION: ${theme.motion}

LAYOUT RULES: ${theme.layoutRules}

DO NOT USE: ${theme.avoid.join(', ')}`;
}
