export interface RunLaunchConfigProps {
  prompt: string;
  setPrompt: (p: string) => void;
  agentMode: string;
  setAgentMode: (m: string) => void;
  model: string;
  setModel: (m: string) => void;
  models: string[];
  isLoadingModels: boolean;
  isLaunching: boolean;
  onLaunch: () => void;
}

export function RunLaunchConfig({
  prompt,
  setPrompt,
  agentMode,
  setAgentMode,
  model,
  setModel,
  models,
  isLoadingModels,
  isLaunching,
  onLaunch,
}: RunLaunchConfigProps) {
  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 mb-6">
      <h3 className="text-lg font-medium mb-3">Launch Configuration</h3>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Run Prompt
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500"
          rows={3}
        />
      </div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Agent Mode
        </label>
        <select
          value={agentMode}
          onChange={(e) => setAgentMode(e.target.value)}
          className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
        >
          <option value="plan">Plan</option>
          <option value="build">Build</option>
        </select>
      </div>
      <div className="mb-4 border-t pt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2">Advanced Settings</h4>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Model
        </label>
        <select
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={isLoadingModels}
          className="w-full border border-gray-300 rounded p-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:opacity-50"
        >
          <option value="">Default</option>
          {isLoadingModels ? (
            <option disabled>Loading models...</option>
          ) : (
            models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))
          )}
        </select>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onLaunch}
          disabled={isLaunching}
          className="bg-green-600 text-white px-4 py-2 rounded font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
        >
          {isLaunching ? "Launching..." : "Confirm Launch"}
        </button>
      </div>
    </div>
  );
}
