// The supplied Kiln workspace is already a complete React component. Vite
// compiles the JSX directly now; the old standalone Babel/importmap loader is
// intentionally not part of the artifact.
// @ts-expect-error The imported source remains JavaScript by design.
import KilnApp from './KilnApp.jsx';

function App() {
  return <KilnApp />;
}

export default App;
