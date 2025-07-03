// Import modules using ES6 syntax
import StorageManager from './modules/StorageManager.js';
import BugReportManager from './modules/BugReportManager.js';
import DataCollector from './modules/DataCollector.js';
import BugDataRestorer from './modules/BugDataRestorer.js';
import MessageHandler from './modules/MessageHandler.js';

// Background service worker for Swift Bug
class BugReporterBackground {
  constructor() {
    // Initialize module instances
    this.storageManager = new StorageManager();
    this.bugReportManager = new BugReportManager();
    this.dataCollector = new DataCollector();
    this.bugDataRestorer = new BugDataRestorer();
    this.messageHandler = new MessageHandler(
      this.bugReportManager,
      this.dataCollector,
      this.bugDataRestorer,
      this.storageManager
    );

    this.setupEventListeners();
  }

  setupEventListeners() {
    // Handle messages from popup and content scripts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      this.messageHandler.handleMessage(message, sender, sendResponse);
      return true; // Keep message channel open for async response
    });

    // Handle extension installation
    chrome.runtime.onInstalled.addListener(() => {
      this.storageManager.initializeStorage();
    });
  }
}

// Initialize background script
new BugReporterBackground();
