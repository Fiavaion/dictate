/**
 * Developer Jargon Map — pre-LLM text correction
 * Runs BEFORE sending to Ollama to fix common STT mishearings.
 * Sorted longest-first so multi-word phrases match before their parts.
 */

const JARGON = [
  // HTTP status codes
  ['five hundred', '500'], ['four oh four', '404'], ['four oh three', '403'],
  ['four oh one', '401'], ['four oh oh', '400'], ['two hundred', '200'],
  ['two oh one', '201'], ['three oh one', '301'], ['three oh two', '302'],

  // Frameworks & runtimes (multi-word first)
  ['next j s', 'Next.js'], ['next js', 'Next.js'],
  ['no j s', 'Node.js'], ['no js', 'Node.js'], ['node js', 'Node.js'],
  ['react native', 'React Native'],
  ['vue js', 'Vue.js'], ['vue j s', 'Vue.js'],
  ['express js', 'Express.js'],
  ['fast a p i', 'FastAPI'], ['fast api', 'FastAPI'],

  // Languages
  ['type script', 'TypeScript'], ['typescript', 'TypeScript'],
  ['java script', 'JavaScript'], ['javascript', 'JavaScript'],
  ['pie thon', 'Python'], ['python', 'Python'],
  ['see sharp', 'C#'], ['c sharp', 'C#'],

  // Tools & tech (multi-word)
  ['claude code', 'Claude Code'],
  ['v s code', 'VS Code'], ['vs code', 'VS Code'],
  ['tail wind', 'Tailwind'], ['tailwind css', 'Tailwind CSS'],
  ['web socket', 'WebSocket'], ['web sockets', 'WebSockets'],
  ['web pack', 'webpack'],
  ['post gress', 'PostgreSQL'], ['post gres', 'PostgreSQL'],
  ['sequel lite', 'SQLite'], ['sequel light', 'SQLite'],
  ['e s lint', 'ESLint'],
  ['mongo d b', 'MongoDB'], ['mongo db', 'MongoDB'],

  // Abbreviations
  ['j s', 'JS'], ['t s', 'TS'], ['c s s', 'CSS'], ['h t m l', 'HTML'],
  ['a p i', 'API'], ['u r l', 'URL'], ['u r i', 'URI'],
  ['h t t p', 'HTTP'], ['h t t p s', 'HTTPS'],
  ['g i t', 'git'], ['g i t hub', 'GitHub'],
  ['i d e', 'IDE'], ['c l i', 'CLI'], ['s d k', 'SDK'],
  ['m c p', 'MCP'], ['s s e', 'SSE'], ['s s r', 'SSR'],
  ['o r m', 'ORM'], ['s q l', 'SQL'], ['j s o n', 'JSON'],
  ['y a m l', 'YAML'], ['t o m l', 'TOML'],
  ['n p m', 'npm'], ['p i p', 'pip'],
  ['l l m', 'LLM'], ['r a g', 'RAG'], ['s t t', 'STT'], ['t t s', 'TTS'],

  // Common compound words
  ['end point', 'endpoint'], ['endpoints', 'endpoints'],
  ['back end', 'backend'], ['front end', 'frontend'],
  ['mid ware', 'middleware'], ['middle ware', 'middleware'],
  ['doc string', 'docstring'],
  ['key word', 'keyword'],
  ['name space', 'namespace'],
  ['time stamp', 'timestamp'],
  ['work flow', 'workflow'],
  ['code base', 'codebase'],
  ['data base', 'database'],
  ['fire wall', 'firewall'],
  ['white space', 'whitespace'],
  ['read me', 'README'],

  // Common mishearings
  ['jason', 'JSON'],
  ['sequel', 'SQL'],
  ['redis', 'Redis'],
  ['mongo', 'MongoDB'],
  ['react', 'React'],
  ['astro', 'Astro'],
  ['docker', 'Docker'],
  ['olama', 'Ollama'], ['ollama', 'Ollama'],
];

// Build regex patterns — case-insensitive, word-boundary
const PATTERNS = JARGON.map(([spoken, written]) => [
  new RegExp(`\\b${spoken.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'),
  written
]);

/**
 * Apply jargon map to raw text. Runs all replacements in order.
 * @param {string} text - Raw STT text
 * @returns {string} Text with developer terms corrected
 */
export function applyJargonMap(text) {
  let result = text;
  for (const [pattern, replacement] of PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}
