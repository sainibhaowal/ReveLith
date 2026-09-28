#!/usr/bin/env node
/**
 * revelith CLI — headless local Office engines.
 * Commands: mcp | check | open | docs | sheet | slides | deck
 */
import { main } from './index.js'

void main(process.argv.slice(2))
