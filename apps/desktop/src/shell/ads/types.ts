export const AdActionType = {
  OpenBrowser: "open_browser",
} as const;

export type AdAction = {
  type: typeof AdActionType.OpenBrowser;
  url: string;
};

export type AdSlot = {
  id: string;
  enabled: boolean;
  dismissible?: boolean;
  placement: "menu";
  target: {
    title: string;
    description: string;
    imageUrl: string;
  };
  content: {
    title: string;
    description: string;
    imageUrl: string;
    details: Array<{
      label: string;
      value: string;
    }>;
    button?: {
      label: string;
      action: AdAction;
    };
  };
};

export function adDismissible(ad: AdSlot): boolean {
  return ad.dismissible !== false;
}

export type AdRuntime = {
  slots: AdSlot[];
};
