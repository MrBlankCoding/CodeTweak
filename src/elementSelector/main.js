import { ElementSelector } from "./core.js";
import { ElementSelectorMenu } from "./menu.js";

const elementSelectorInstance = new ElementSelector();

chrome.runtime.onMessage.addListener((message) => {
  if (message.action === "startSelection") {
    const menu = new ElementSelectorMenu(elementSelectorInstance);
    menu.start();
  } else if (message.action === "startAiSelection") {
    elementSelectorInstance.startSelection(
      (element) => {
        if (element) {
          const selector = elementSelectorInstance.getUniqueSelector(element);
          chrome.runtime.sendMessage({
            action: "aiElementSelected",
            selector: selector,
          });
        }
        elementSelectorInstance.cleanup();
      },
      () => {
        // Do nothing on cancel, cleanup is handled by the selector
      }
    );
  } else if (message.action === "stopSelection") {
    elementSelectorInstance.cleanup();
  }
});
