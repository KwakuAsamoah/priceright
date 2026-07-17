/** BOM table column widths — shared with ProductCreatePanel / IntermediateCreatePanel */

export const bomTableStyle = {
  width: '100%',
  maxWidth: '100%',
  minWidth: 0,
  tableLayout: 'fixed' as const,
  borderCollapse: 'collapse' as const,
  margin: 0,
  border: 'none',
};

export const bomColMaterialStyle = {
  width: '320px',
  textAlign: 'left' as const,
};

export const bomColQuantityStyle = {
  width: '90px',
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

export const bomColUnitStyle = {
  width: '60px',
  textAlign: 'left' as const,
  whiteSpace: 'nowrap' as const,
};

export const bomColUnitPriceStyle = {
  width: '110px',
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

export const bomColTotalStyle = {
  width: '110px',
  textAlign: 'right' as const,
  whiteSpace: 'nowrap' as const,
};

export const bomMaterialCellStyle = {
  ...bomColMaterialStyle,
  wordBreak: 'break-word' as const,
};

export const bomActionCellStyle = {
  width: '150px',
  textAlign: 'center' as const,
  whiteSpace: 'nowrap' as const,
  paddingLeft: '8px',
  paddingRight: '12px',
};

export const bomActionButtonsStyle = {
  display: 'flex',
  gap: '6px',
  justifyContent: 'center',
  flexWrap: 'nowrap' as const,
  flexShrink: 0,
};

export const bomActionButtonStyle = {
  padding: '4px 10px',
};
