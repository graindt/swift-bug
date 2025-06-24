// Modal Manager - Handles modal dialog operations
export class ModalManager {
  constructor() {
    this.isEscapeListenerAdded = false;
  }

  showBugDetailModal(report, generateBugDetailHTML) {
    const modal = document.getElementById('bugDetailModal');
    const body = document.getElementById('bugDetailBody');

    // Generate the bug detail HTML
    body.innerHTML = generateBugDetailHTML(report);

    // Expand popup body width for detail view
    document.body.style.width = '1200px';

    // Show the modal
    modal.style.display = 'flex';

    // Add escape key listener
    if (!this.isEscapeListenerAdded) {
      document.addEventListener('keydown', this.handleEscapeKey.bind(this));
      this.isEscapeListenerAdded = true;
    }
  }

  closeBugDetailModal() {
    const modal = document.getElementById('bugDetailModal');
    modal.style.display = 'none';

    // Restore original popup body size
    document.body.style.width = '400px';

    // Remove escape key listener
    if (this.isEscapeListenerAdded) {
      document.removeEventListener('keydown', this.handleEscapeKey.bind(this));
      this.isEscapeListenerAdded = false;
    }
  }

  handleEscapeKey(event) {
    if (event.key === 'Escape') {
      this.closeBugDetailModal();
    }
  }

  setupModalEventListeners() {
    // Bug detail modal close button
    document.getElementById('closeBugDetail').addEventListener('click', () => {
      this.closeBugDetailModal();
    });

    // Close modal when clicking outside
    document.getElementById('bugDetailModal').addEventListener('click', (event) => {
      if (event.target === document.getElementById('bugDetailModal')) {
        this.closeBugDetailModal();
      }
    });
  }
}
