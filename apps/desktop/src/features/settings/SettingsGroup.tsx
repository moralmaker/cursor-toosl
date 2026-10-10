import type { ReactNode } from "react";
import { Card } from "../../shared/ui/Card";
import styles from "./SettingsGroup.module.scss";

export function SettingsGroup({ title, action, children }: { title: ReactNode; action?: ReactNode; children: ReactNode }) {
  return <Card as="section" className={styles.group}>
    <header><h2>{title}</h2>{action}</header>
    <div>{children}</div>
  </Card>;
}

export function SettingRow({ title, description, children }: { title: ReactNode; description?: ReactNode; children?: ReactNode }) {
  return <div className={styles.row}>
    <div className={styles.copy}>
      <strong>{title}</strong>
      {description != null && <p>{description}</p>}
    </div>
    {children != null && <div className={styles.control}>{children}</div>}
  </div>;
}
