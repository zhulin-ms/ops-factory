import { useState } from 'react'
import type { McpAddRequest, McpType } from '../../types/mcp'

interface AddMcpModalProps {
  isOpen: boolean
  onClose: () => void
  onAdd: (request: McpAddRequest) => Promise<void>
}

type ConnectionType = 'stdio' | 'streamable_http'

export default function AddMcpModal({ isOpen, onClose, onAdd }: AddMcpModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [connectionType, setConnectionType] = useState<ConnectionType>('stdio')
  const [command, setCommand] = useState('')
  const [args, setArgs] = useState('')
  const [uri, setUri] = useState('')
  const [envVars, setEnvVars] = useState<Array<{ key: string; value: string }>>([])
  const [timeout, setTimeout] = useState('300')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetForm = () => {
    setName('')
    setDescription('')
    setConnectionType('stdio')
    setCommand('')
    setArgs('')
    setUri('')
    setEnvVars([])
    setTimeout('300')
    setError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const addEnvVar = () => {
    setEnvVars([...envVars, { key: '', value: '' }])
  }

  const removeEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index))
  }

  const updateEnvVar = (index: number, field: 'key' | 'value', value: string) => {
    setEnvVars(envVars.map((env, i) =>
      i === index ? { ...env, [field]: value } : env
    ))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Validation
    if (!name.trim()) {
      setError('Name is required')
      return
    }

    if (connectionType === 'stdio' && !command.trim()) {
      setError('Command is required for stdio connection')
      return
    }

    if (connectionType === 'streamable_http' && !uri.trim()) {
      setError('URI is required for HTTP connection')
      return
    }

    // Build envs object
    const envs: Record<string, string> = {}
    for (const { key, value } of envVars) {
      if (key.trim()) {
        envs[key.trim()] = value
      }
    }

    const request: McpAddRequest = {
      name: name.trim(),
      enabled: true,
      type: connectionType as McpType,
      description: description.trim() || undefined,
      timeout: parseInt(timeout, 10) || 300,
      ...(connectionType === 'stdio' && {
        cmd: command.trim(),
        args: args.trim() ? args.trim().split(/\s+/) : [],
        envs: Object.keys(envs).length > 0 ? envs : undefined,
      }),
      ...(connectionType === 'streamable_http' && {
        uri: uri.trim(),
        envs: Object.keys(envs).length > 0 ? envs : undefined,
      }),
    }

    setIsSubmitting(true)
    try {
      await onAdd(request)
      handleClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add MCP server')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content mcp-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Add MCP Server</h2>
          <button
            type="button"
            className="modal-close"
            onClick={handleClose}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mcp-form">
          {error && (
            <div className="mcp-form-error">{error}</div>
          )}

          <div className="mcp-form-group">
            <label className="mcp-form-label">
              Name <span className="mcp-form-required">*</span>
            </label>
            <input
              type="text"
              className="mcp-form-input"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="my-mcp-server"
            />
          </div>

          <div className="mcp-form-group">
            <label className="mcp-form-label">Description</label>
            <input
              type="text"
              className="mcp-form-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="What does this MCP server do?"
            />
          </div>

          <div className="mcp-form-group">
            <label className="mcp-form-label">Connection Type</label>
            <div className="mcp-form-radio-group">
              <label className="mcp-form-radio">
                <input
                  type="radio"
                  name="connectionType"
                  value="stdio"
                  checked={connectionType === 'stdio'}
                  onChange={() => setConnectionType('stdio')}
                />
                <span>Standard IO (stdio)</span>
              </label>
              <label className="mcp-form-radio">
                <input
                  type="radio"
                  name="connectionType"
                  value="streamable_http"
                  checked={connectionType === 'streamable_http'}
                  onChange={() => setConnectionType('streamable_http')}
                />
                <span>HTTP (streamable_http)</span>
              </label>
            </div>
          </div>

          {connectionType === 'stdio' && (
            <>
              <div className="mcp-form-group">
                <label className="mcp-form-label">
                  Command <span className="mcp-form-required">*</span>
                </label>
                <input
                  type="text"
                  className="mcp-form-input"
                  value={command}
                  onChange={e => setCommand(e.target.value)}
                  placeholder="python"
                />
              </div>

              <div className="mcp-form-group">
                <label className="mcp-form-label">Arguments</label>
                <input
                  type="text"
                  className="mcp-form-input"
                  value={args}
                  onChange={e => setArgs(e.target.value)}
                  placeholder="-m my_mcp_server"
                />
                <span className="mcp-form-hint">Space-separated arguments</span>
              </div>
            </>
          )}

          {connectionType === 'streamable_http' && (
            <div className="mcp-form-group">
              <label className="mcp-form-label">
                URI <span className="mcp-form-required">*</span>
              </label>
              <input
                type="text"
                className="mcp-form-input"
                value={uri}
                onChange={e => setUri(e.target.value)}
                placeholder="http://localhost:8080/mcp"
              />
            </div>
          )}

          <div className="mcp-form-group">
            <label className="mcp-form-label">
              Environment Variables
              <button
                type="button"
                className="mcp-form-add-btn"
                onClick={addEnvVar}
              >
                + Add
              </button>
            </label>
            {envVars.map((env, index) => (
              <div key={index} className="mcp-form-env-row">
                <input
                  type="text"
                  className="mcp-form-input mcp-form-env-key"
                  value={env.key}
                  onChange={e => updateEnvVar(index, 'key', e.target.value)}
                  placeholder="KEY"
                />
                <input
                  type="text"
                  className="mcp-form-input mcp-form-env-value"
                  value={env.value}
                  onChange={e => updateEnvVar(index, 'value', e.target.value)}
                  placeholder="value"
                />
                <button
                  type="button"
                  className="mcp-form-remove-btn"
                  onClick={() => removeEnvVar(index)}
                >
                  &times;
                </button>
              </div>
            ))}
          </div>

          <div className="mcp-form-group">
            <label className="mcp-form-label">Timeout (seconds)</label>
            <input
              type="number"
              className="mcp-form-input mcp-form-input-small"
              value={timeout}
              onChange={e => setTimeout(e.target.value)}
              min="1"
              max="3600"
            />
          </div>

          <div className="mcp-form-actions">
            <button
              type="button"
              className="mcp-form-btn mcp-form-btn-secondary"
              onClick={handleClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="mcp-form-btn mcp-form-btn-primary"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Adding...' : 'Add MCP Server'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
