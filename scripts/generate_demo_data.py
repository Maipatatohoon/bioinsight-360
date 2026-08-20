import csv
import json
import random
import os

os.makedirs('/home/patato19/Projects/bioinsight-360-app/public/data', exist_ok=True)

# 1. demo_counts.csv
genes_list = [
    "TP53", "BRCA1", "EGFR", "MYC", "KRAS", "PTEN", "RB1", "AKT1", "VEGFA", "MTOR", "PIK3CA", "BRAF", 
    "CDK4", "CDK6", "BCL2", "BAX", "CASP3", "CASP9", "GAPDH", "ACTB", "TNF", "IL6", "IL1B", "STAT3", 
    "JAK2", "NFKB1", "TGFB1", "WNT1", "NOTCH1", "HIF1A", "ERBB2", "FGFR1", "PDGFRA", "KIT", "MET", 
    "ALK", "ROS1", "RET", "RAF1", "MAP2K1", "MAPK1", "MAPK3", "APC", "SMAD4", "CDKN2A", "MDM2", 
    "FOS", "JUN", "MMP2", "MMP9", "CRISPLD2", "DUSP1", "SERPINA1", "PER1", "NFKBIA", "KLF2", "TSC22D3", 
    "FKBP5", "ZBTB16"
]

dex_genes = ["CRISPLD2", "DUSP1", "SERPINA1", "PER1", "NFKBIA", "KLF2", "TSC22D3", "FKBP5", "ZBTB16"]
housekeeping = ["GAPDH", "ACTB"]

controls = ["SRR1039508", "SRR1039512", "SRR1039516", "SRR1039520"]
treated = ["SRR1039509", "SRR1039513", "SRR1039517", "SRR1039521"]
samples = controls + treated

counts_data = []
header = ["gene"] + samples
counts_data.append(header)

low_count_genes = [f"GENE_LOW_{i:03d}" for i in range(1, 31)]
other_genes = [f"GENE_{i:03d}" for i in range(1, 201 - len(genes_list) - len(low_count_genes))]

all_genes = genes_list + low_count_genes + other_genes

for gene in all_genes:
    row = [gene]
    base_val = random.randint(50, 5000)
    if gene in housekeeping:
        base_val = random.randint(5000, 15000)
    elif gene in low_count_genes:
        base_val = random.randint(0, 20)
    
    for sample in samples:
        val = base_val
        if gene in dex_genes and sample in treated:
            val = int(base_val * random.uniform(2.0, 5.0))
        # Add some noise
        if base_val > 20:
             val = int(val * random.uniform(0.8, 1.2))
        else:
             val = max(0, int(val + random.randint(-2, 2)))
        row.append(val)
    counts_data.append(row)

# Adjust columns to target library sizes
# 800,000 to 1,200,000
target_sizes = {s: random.randint(800000, 1200000) for s in samples}
col_sums = {s: 0 for s in samples}

for row in counts_data[1:]:
    for i, s in enumerate(samples):
        col_sums[s] += row[i+1]

for row in counts_data[1:]:
    for i, s in enumerate(samples):
        if row[0] not in housekeeping:
            row[i+1] = int(row[i+1] * (target_sizes[s] / col_sums[s]))
        
with open('/home/patato19/Projects/bioinsight-360-app/public/data/demo_counts.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerows(counts_data)


# 2. demo_metadata.csv
with open('/home/patato19/Projects/bioinsight-360-app/public/data/demo_metadata.csv', 'w', newline='') as f:
    writer = csv.writer(f)
    writer.writerow(["sample", "group"])
    for s in controls:
        writer.writerow([s, "CONTROL"])
    for s in treated:
        writer.writerow([s, "TREATED"])


# 3. go_annotations.json
go_terms = {
    "GO:0007049": {"name": "cell cycle", "genes": ["TP53", "BRCA1", "CDK4", "CDK6", "RB1", "CDKN2A", "MDM2", "MYC"]},
    "GO:0006915": {"name": "apoptotic process", "genes": ["TP53", "BCL2", "BAX", "CASP3", "CASP9", "PTEN", "MDM2", "NFKB1"]},
    "GO:0007165": {"name": "signal transduction", "genes": ["EGFR", "KRAS", "AKT1", "PIK3CA", "BRAF", "JAK2", "STAT3", "WNT1", "NOTCH1", "SMAD4"]},
    "GO:0006954": {"name": "inflammatory response", "genes": ["TNF", "IL6", "IL1B", "NFKB1", "TGFB1", "STAT3"]},
    "GO:0006281": {"name": "DNA repair", "genes": ["TP53", "BRCA1", "PTEN"]},
    "GO:0008283": {"name": "cell proliferation", "genes": ["MYC", "EGFR", "KRAS", "VEGFA", "FOS", "JUN", "CDK4", "CDK6", "PDGFRA"]},
    "GO:0001525": {"name": "angiogenesis", "genes": ["VEGFA", "HIF1A", "FOS", "JUN", "TGFB1"]},
    "GO:0006955": {"name": "immune response", "genes": ["TNF", "IL6", "IL1B", "STAT3", "JAK2", "NFKB1"]},
    "GO:0006468": {"name": "protein phosphorylation", "genes": ["EGFR", "AKT1", "MTOR", "PIK3CA", "BRAF", "CDK4", "CDK6", "JAK2", "ERBB2", "FGFR1", "PDGFRA", "KIT", "MET", "ALK", "ROS1", "RET", "RAF1", "MAP2K1", "MAPK1", "MAPK3"]},
    "GO:0006355": {"name": "regulation of transcription, DNA-templated", "genes": ["TP53", "MYC", "STAT3", "NFKB1", "HIF1A", "SMAD4", "FOS", "JUN", "PER1", "KLF2", "TSC22D3", "ZBTB16"]},
    "GO:0042493": {"name": "response to drug", "genes": ["TP53", "EGFR", "BRCA1", "BAX", "MDM2", "CRISPLD2", "DUSP1", "SERPINA1", "FKBP5"]},
    "GO:0051384": {"name": "response to glucocorticoid", "genes": ["CRISPLD2", "DUSP1", "SERPINA1", "PER1", "NFKBIA", "KLF2", "TSC22D3", "FKBP5", "ZBTB16", "NFKB1"]},
    "GO:0050728": {"name": "negative regulation of inflammatory response", "genes": ["TGFB1", "DUSP1", "NFKBIA", "TSC22D3"]},
    "GO:0043066": {"name": "negative regulation of apoptotic process", "genes": ["BCL2", "AKT1", "MTOR", "PIK3CA", "NFKB1"]},
    "GO:0010628": {"name": "positive regulation of gene expression", "genes": ["MYC", "STAT3", "HIF1A", "NFKB1", "FOS", "JUN"]},
    "GO:0000165": {"name": "MAPK cascade", "genes": ["KRAS", "BRAF", "RAF1", "MAP2K1", "MAPK1", "MAPK3", "EGFR", "ERBB2", "DUSP1"]},
    "GO:0014065": {"name": "phosphatidylinositol 3-kinase signaling", "genes": ["PIK3CA", "AKT1", "MTOR", "PTEN", "EGFR"]},
    "GO:0016055": {"name": "Wnt signaling pathway", "genes": ["WNT1", "APC", "MYC", "CTNNB1"]},
    "GO:0007219": {"name": "Notch signaling pathway", "genes": ["NOTCH1", "MYC"]},
    "GO:0007259": {"name": "JAK-STAT cascade", "genes": ["JAK2", "STAT3", "IL6"]},
    
    "GO:0006935": {"name": "chemotaxis", "genes": ["VEGFA", "IL6", "TGFB1"]},
    "GO:0030198": {"name": "extracellular matrix organization", "genes": ["MMP2", "MMP9", "TGFB1"]},
    "GO:0007155": {"name": "cell adhesion", "genes": ["TGFB1", "APC", "EGFR"]},
    "GO:0006979": {"name": "response to oxidative stress", "genes": ["TP53", "HIF1A", "FOS", "MAPK1"]},
    "GO:0006950": {"name": "response to stress", "genes": ["TP53", "BAX", "CASP3", "FOS", "JUN", "HIF1A", "NFKB1"]},
    "GO:0008285": {"name": "negative regulation of cell population proliferation", "genes": ["TP53", "RB1", "PTEN", "CDKN2A", "TGFB1"]},
    "GO:0008284": {"name": "positive regulation of cell population proliferation", "genes": ["MYC", "EGFR", "KRAS", "FOS", "JUN"]},
    "GO:0030154": {"name": "cell differentiation", "genes": ["NOTCH1", "TGFB1", "WNT1", "SMAD4"]},
    "GO:0001666": {"name": "response to hypoxia", "genes": ["HIF1A", "VEGFA"]},
    "GO:0010033": {"name": "response to alditol", "genes": []},
    "GO:0007568": {"name": "aging", "genes": ["TP53", "MTOR", "SIRT1"]},
    "GO:0006629": {"name": "lipid metabolic process", "genes": ["PTEN", "AKT1", "PIK3CA"]},
    "GO:0006091": {"name": "generation of precursor metabolites and energy", "genes": ["GAPDH"]},
    "GO:0005975": {"name": "carbohydrate metabolic process", "genes": ["GAPDH", "HIF1A", "MYC"]},
    "GO:0006412": {"name": "translation", "genes": ["MTOR"]},
    "GO:0007059": {"name": "chromosome segregation", "genes": ["BRCA1", "TP53"]},
    "GO:0006260": {"name": "DNA replication", "genes": ["CDK4", "CDK6", "RB1", "MYC", "TP53"]},
    "GO:0007169": {"name": "transmembrane receptor protein tyrosine kinase signaling pathway", "genes": ["EGFR", "ERBB2", "PDGFRA", "FGFR1", "KIT", "MET", "ALK", "ROS1", "RET"]},
    "GO:0043065": {"name": "positive regulation of apoptotic process", "genes": ["TP53", "BAX", "CASP3", "CASP9", "PTEN", "MDM2"]},
    "GO:0045944": {"name": "positive regulation of transcription by RNA polymerase II", "genes": ["MYC", "STAT3", "NFKB1", "HIF1A", "FOS", "JUN"]}
}

go_data = {"terms": go_terms}
with open('/home/patato19/Projects/bioinsight-360-app/public/data/go_annotations.json', 'w') as f:
    json.dump(go_data, f, indent=2)

