const ACTIONS: Record<string, string> = {
  add: 'Adding',
  analyze: 'Analyzing',
  apply: 'Applying',
  build: 'Building',
  create: 'Creating',
  delete: 'Removing',
  edit: 'Editing',
  export: 'Exporting',
  find: 'Finding',
  format: 'Formatting',
  generate: 'Generating',
  get: 'Loading',
  import: 'Importing',
  insert: 'Inserting',
  inspect: 'Inspecting',
  list: 'Listing',
  move: 'Moving',
  read: 'Reading',
  remove: 'Removing',
  review: 'Reviewing',
  save: 'Saving',
  search: 'Searching',
  set: 'Setting',
  update: 'Updating',
  write: 'Writing',
}

/** Human-readable, action-specific progress based on the tool actually running. */
export function toolActivityLabel(name: string): string {
  const words = name
    .replace(/([a-z0-9])([A-Z])/gu, '$1 $2')
    .replace(/[_-]+/gu, ' ')
    .trim()
  if (!words) return 'Working'
  const [verb, ...subject] = words.split(/\s+/u)
  const action = ACTIONS[verb!.toLowerCase()]
  return action
    ? `${action}${subject.length ? ` ${subject.join(' ')}` : ''}`
    : `Working on ${words}`
}
