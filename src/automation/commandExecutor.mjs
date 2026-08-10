const ACTION_TAGS = [
  { type: 'OPEN_URL', pattern: /<OPEN_URL>(.*?)<\/OPEN_URL>/gs },
  { type: 'OPEN_APP', pattern: /<OPEN_APP>(.*?)<\/OPEN_APP>/gs },
  { type: 'SYSTEM_COMMAND', pattern: /<SYSTEM_COMMAND>(.*?)<\/SYSTEM_COMMAND>/gs },
  { type: 'DESKTOP', pattern: /<DESKTOP_TASK>(.*?)<\/DESKTOP_TASK>/gs },
  { type: 'PYTHON_BROWSER', pattern: /<PYTHON_BROWSER_TASK>(.*?)<\/PYTHON_BROWSER_TASK>/gs },
  { type: 'BROWSER', pattern: /<BROWSER_TASK>(.*?)<\/BROWSER_TASK>/gs },
];

export function extractActionPlan(response) {
  const allTasks = ACTION_TAGS.flatMap(({ type, pattern }) =>
    Array.from(response.matchAll(pattern)).map((match) => ({
      type,
      value: match[1].trim(),
      index: match.index ?? 0,
    }))
  ).sort((a, b) => a.index - b.index);

  return allTasks;
}
