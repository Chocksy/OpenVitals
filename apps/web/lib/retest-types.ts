export interface MetricDetail {
  code: string;
  name: string;
  lastValue?: number | null;
  unit?: string | null;
  daysSince?: number;
}

export interface LabPanelPlanGroup {
  domain: string;
  priority: string;
  reason: string;
  rationale?: string;
  metrics: string[];
  metricNames?: string[];
  metricDetails?: MetricDetail[];
}

export interface LabPanelPlan {
  summary: string;
  groups: LabPanelPlanGroup[];
  optional?: {
    reason: string;
    metrics: string[];
    metricNames?: string[];
    metricDetails?: MetricDetail[];
  };
  newSuggestions?: Array<{
    name: string;
    code: string;
    reason: string;
  }>;
}
