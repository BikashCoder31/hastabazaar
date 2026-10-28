/** Call with recorded/public commercial identity only, never inferred from the supplier route. */
export function sellerDisclosure(input: { managed: boolean; supplierName: string; legalSellerName?: string | null }) {
  return input.managed
    ? [`Supplied by ${input.supplierName}`, input.legalSellerName ? `Sold and invoiced by ${input.legalSellerName}` : 'Seller and invoice identity require review']
    : [`Sold by ${input.supplierName}`, 'Through Hastabazaar'];
}
