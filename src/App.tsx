import './App.css';
import NavSidebar from './components/Nav/NavSidebar';
import NavBottom from './components/Nav/NavBottom';
import CommandCenter from './sections/CommandCenter';
import DailySignal from './sections/DailySignal';
import TemporalPatterns from './sections/TemporalPatterns';
import Anomalies from './sections/Anomalies';
import SubmeterIntelligence from './sections/SubmeterIntelligence';
import Engine from './sections/Engine';
import LiveStream from './sections/LiveStream';
import Final from './sections/Final';

export default function App() {
  return (
    <div className="page">
      <NavSidebar />
      <NavBottom />

      <main className="main-content">
        <CommandCenter />

        <div id="daily-signal">
          <DailySignal />
        </div>

        <div id="temporal">
          <TemporalPatterns />
        </div>

        <div id="anomalies">
          <Anomalies />
        </div>

        <div id="submeter">
          <SubmeterIntelligence />
        </div>

        <div id="engine">
          <Engine />
        </div>

        <div id="live-stream">
          <LiveStream />
        </div>

        <div id="closing">
          <Final />
        </div>

        <footer className="footer">
          <div className="footer-inner">
            <span>UCI Machine Learning Repository — Individual Household Electric Power Consumption</span>
            <span>Group 16 — BDC Continuous Assessment</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
