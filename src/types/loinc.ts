export type LoincStatus = 'ACTIVE' | 'TRIAL' | 'DEPRECATED' | 'DISCOURAGED';

export interface SearchResult {
  loinc_num: string;
  component: string;
  shortname: string | null;
  long_common_name: string | null;
  system: string;
  example_units: string | null;
  ucum_units: string | null;
  status: LoincStatus;
  external_copyright_notice: string | null;
  score: number;
}

export interface LookupResult {
  loinc_num: string;
  component: string;
  property: string;
  time_aspct: string;
  system: string;
  scale_typ: string;
  method_typ: string | null;
  class: string;
  status: LoincStatus;
  shortname: string | null;
  long_common_name: string | null;
  related_names: string | null;
  example_units: string | null;
  ucum_units: string | null;
  definition: string | null;
  version_first_released: string | null;
  version_last_changed: string | null;
  external_copyright_notice: string | null;
  consumer_names: string[];
  deprecated_alias?: {
    source_code: string;
    comment: string | null;
  };
}
