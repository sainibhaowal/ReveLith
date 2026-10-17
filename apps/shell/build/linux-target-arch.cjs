function linuxTargetArch(hostArch) {
  if (hostArch === 'arm64') return 'arm64'
  if (hostArch === 'x64') return 'x64'
  throw new Error(`Unsupported Linux build host architecture: ${hostArch}`)
}

module.exports = { linuxTargetArch }
