const b4a = require('b4a')
const binding = require('../binding')
const ip = require('./ip')
const Socket = require('./socket')
const Stream = require('./stream')
const NetworkInterfaces = require('./network-interfaces')

const MAX_MESSAGE = 4096
const BUFFER_SIZE = 65536 + MAX_MESSAGE

module.exports = class UDX {
  constructor () {
    this._handle = b4a.allocUnsafe(binding.sizeof_udx_napi_t)
    this._watchers = new Set()
    this._view64 = new BigUint64Array(this._handle.buffer, this._handle.byteOffset, this._handle.byteLength >> 3)

    this._buffer = null
    this._reallocMessage()

    binding.udx_napi_init(this._handle, this._buffer)
  }

  static isIPv4 (host) {
    return ip.isIPv4(host)
  }

  static isIPv6 (host) {
    return ip.isIPv6(host)
  }

  static isIP (host) {
    return ip.isIP(host)
  }

  get bytesTransmitted () {
    return Number(this._view64[binding.offsetof_udx_t_bytes_tx >> 3])
  }

  get packetsTransmitted () {
    return Number(this._view64[binding.offsetof_udx_t_packets_tx >> 3])
  }

  get bytesReceived () {
    return Number(this._view64[binding.offsetof_udx_t_bytes_rx >> 3])
  }

  get packetsReceived () {
    return Number(this._view64[binding.offsetof_udx_t_packets_rx >> 3])
  }

  get packetsDroppedByKernel () {
    return Number(this._view64[binding.offsetof_udx_t_packets_dropped_by_kernel >> 3])
  }

  _consumeMessage (len) {
    const next = this._buffer.subarray(0, len)
    this._buffer = this._buffer.subarray(len)
    if (this._buffer.byteLength < MAX_MESSAGE) this._reallocMessage()
    return next
  }

  _reallocMessage () {
    // TODO: move reallocation to native
    this._buffer = b4a.allocUnsafe(BUFFER_SIZE)
    return this._buffer
  }

  createSocket (opts) {
    return new Socket(this, opts)
  }

  createStream (id, opts) {
    return new Stream(this, id, opts)
  }

  networkInterfaces () {
    let [watcher = null] = this._watchers
    if (watcher) return watcher.interfaces

    watcher = new NetworkInterfaces(this)
    watcher.destroy()

    return watcher.interfaces
  }

  watchNetworkInterfaces (onchange) {
    const watcher = new NetworkInterfaces(this)

    this._watchers.add(watcher)
    watcher.on('close', () => {
      this._watchers.delete(watcher)
    })

    if (onchange) watcher.on('change', onchange)

    return watcher.watch()
  }

  async lookup (host, opts = {}) {
    const {
      family = 0
    } = opts

    const req = b4a.allocUnsafe(binding.sizeof_udx_napi_lookup_t)
    const ctx = {
      req,
      resolve: null,
      reject: null
    }

    const promise = new Promise((resolve, reject) => {
      ctx.resolve = resolve
      ctx.reject = reject
    })

    binding.udx_napi_lookup(this._handle, req, host, family, ctx, onlookup)

    return promise
  }
}

function onlookup (err, host, family) {
  if (err) this.reject(err)
  else this.resolve({ host, family })
}
