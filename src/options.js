import {parse as parseQueryString} from 'query-string'

export function parseOptions(hash) {
  const parsed = parseQueryString(hash)

  for (const key of Object.keys(parsed)) {
    if (key === 'title') {
      continue
    }

    parsed[key] = parseFloat(parsed[key])
    if (isNaN(parsed[key])) {
      throw new Error('invalid options')
    }
  }

  return parsed
}

