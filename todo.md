# TODO

## Improvements to Internal Browser / Local Link Manager Functionality

### UI Improvement of the Local Link Manager

- **What it means:**  
  Visual and interactive upgrades to the user interface of the “local” start page (LinkManagerView).

- **Specific suggestions:**  
  - Better appearance of the link list: Use cards, website icons (favicons), or groupings (e.g., AI chats, dictionaries, documentation).  
  - Advanced form management: Add URL validation, automatic page title filling based on URL (requires server-side).  
  - “Open in new tab” option in the form: Add a checkbox to manually select link behavior.  
  - Drag-and-drop for sorting links: Enable rearranging links by dragging and dropping.  
  - Link search: Add a search/filter field for the list of links.  
  - Visual feedback: Display success/error messages (e.g., using Toast notifications).  

## Adding Search Functionality on the “Local” Page

- **What it means:**  
  Enable the user to directly search the web via an input field on the “local” page.

- **Specific suggestions:**  
  - Add a “Search” button next to the URL input field.  
  - Logic for forming search URLs (e.g., for Google: `https://www.google.com/search?q=your+text+here`).  
  - Open search results (probably in a new tab).  
  - Implement the logic in the `handleNavigate` function in InternalBrowserView to distinguish between URLs and search terms.  

## Implementation of Basic Navigation Buttons (Back/Forward/Refresh) for the iframe (Watch Out for CORS Restrictions)

- **What it means:**  
  Add back, forward, and refresh buttons that work inside the `<iframe>`.

- **Specific suggestions:**  
  - Add buttons (with appropriate icons like ArrowLeft, ArrowRight, RefreshCw) next to the URL input field in `InternalBrowserView.tsx`.  
  - Implement click handlers for these buttons.  
  - Connect to `iframeRef.current.contentWindow.history` (limited by CORS): Standard way to control iframe navigation; works only for same-domain pages.  
  - Alternatives for navigation (if CORS blocks): Track history of URLs entered/clicked by the user manually and reload the iframe with the corresponding URL. The refresh button would just reset `iframeRef.current.src` to the current URL.  

## Further Improvement of Resize Logic

- **What it means:**  
  Fine-tuning the resize implementation for editor and browser space.

- **Specific suggestions:**  
  - Better boundary management: Adjust minimum and maximum widths using `Math.max`, `Math.min`.  
  - Debouncing/throttling mousemove: Optimize performance handling mouse movements during resize.  
  - Visual feedback during resize: Change cursor style or add a visual line that follows the resizer’s position.  

