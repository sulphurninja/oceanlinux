'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { RefreshCw, ExternalLink, Copy, Search, Plus, Eye } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

interface HostycareProduct {
  id: string;
  name: string;
  description?: string;
  pricing?: {
    monthly?: number;
    quarterly?: number;
    annually?: number;
    setup?: number;
  };
  category?: string;
  status?: string;
  configOptions?: any;
  features?: string[];
}

interface AccountInfo {
  currency?: string;
  amount?: number;
  status?: string;
}

const HostycareProductsPage = () => {
  const [products, setProducts] = useState<HostycareProduct[]>([]);
  const [filteredProducts, setFilteredProducts] = useState<HostycareProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [credit, setCredit] = useState<AccountInfo | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<HostycareProduct | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  useEffect(() => {
    fetchHostycareData();
  }, []);

  useEffect(() => {
    // Filter products based on search term
    if (searchTerm.trim() === '') {
      setFilteredProducts(products);
    } else {
      const filtered = products.filter(product =>
        product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        product.description?.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredProducts(filtered);
    }
  }, [searchTerm, products]);

  const fetchHostycareData = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/hostycare/test');
      const data = await response.json();

      if (data.success) {
        const productsData = data.products?.data || data.products || [];
        const creditData = data.credit?.data || data.credit || null;

        setProducts(productsData);
        setFilteredProducts(productsData);
        setCredit(creditData);

        toast.success(`Loaded ${productsData.length} Hostycare products`);
      } else {
        toast.error('Failed to load Hostycare products: ' + data.error);
        console.error('Hostycare API Error:', data);
      }
    } catch (error) {
      toast.error('Error fetching Hostycare products');
      console.error('Fetch Error:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyProductId = (productId: string) => {
    navigator.clipboard.writeText(productId);
    toast.success(`Product ID "${productId}" copied to clipboard`);
  };

  const copyProductInfo = (product: HostycareProduct) => {
    const info = `Product ID: ${product.id}\nName: ${product.name}\nMonthly Price: $${product.pricing?.monthly || 'N/A'}`;
    navigator.clipboard.writeText(info);
    toast.success('Product information copied to clipboard');
  };

  const openCreateIPStock = (productId: string) => {
    const url = `/admin/ipStock?hostycare_product_id=${productId}`;
    window.open(url, '_blank');
  };

  const viewProductDetails = (product: HostycareProduct) => {
    setSelectedProduct(product);
    setShowDetailsDialog(true);
  };

  const formatPrice = (price: number | undefined, currency: string = '$') => {
    return price ? `${currency}${price}` : 'N/A';
  };

  const stats = {
    total: products.length,
    withPricing: products.filter(p => p.pricing?.monthly).length,
    categories: [...new Set(products.map(p => p.category).filter(Boolean))].length
  };

  return (
    <div className="w-full">
      <div className="h-[63px] flex gap-2 items-center border-b p-4">
        <h1 className="text-xl flex items-center gap-2">
          <ExternalLink className="h-5 w-5" />
          Hostycare Products Browser
        </h1>
        <Button variant="outline" onClick={fetchHostycareData} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="p-6">
        {/* Account Info */}
        {credit && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Account Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm text-gray-600">Available Credit</label>
                  <p className="text-lg font-semibold">
                    {credit.currency || '$'} {credit.amount || '0.00'}
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Account Status</label>
                  <p className="text-lg">
                    <Badge variant={credit.status === 'active' ? 'default' : 'secondary'}>
                      {credit.status || 'Unknown'}
                    </Badge>
                  </p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Total Products</label>
                  <p className="text-lg font-semibold">{stats.total}</p>
                </div>
                <div>
                  <label className="text-sm text-gray-600">Last Updated</label>
                  <p className="text-lg">{new Date().toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Search and Stats */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                  <Input
                    placeholder="Search products by name, ID, or description..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="text-sm text-gray-600">
                  Showing {filteredProducts.length} of {stats.total} products
                </div>
              </div>
              <Button
                onClick={() => window.open('/admin/ipStock', '_blank')}
                className="bg-green-600 hover:bg-green-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Create IP Stock
              </Button>
            </div>

            <div className="flex gap-4 text-sm text-gray-600">
              <span>Products with pricing: {stats.withPricing}</span>
              <span>•</span>
              <span>Categories: {stats.categories}</span>
            </div>
          </CardContent>
        </Card>

        {/* Products Table */}
        <Card>
          <CardHeader>
            <CardTitle>Available Products</CardTitle>
            <p className="text-sm text-gray-600">
              Click on Product IDs to copy them for use in IP Stock creation
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="flex justify-center py-10">
                <RefreshCw className="animate-spin h-8 w-8 text-muted-foreground" />
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <ExternalLink className="h-12 w-12 mx-auto mb-3 opacity-20" />
                <p>
                  {searchTerm ? `No products found matching "${searchTerm}"` : 'No products available'}
                </p>
                {searchTerm && (
                  <Button
                    variant="outline"
                    onClick={() => setSearchTerm('')}
                    className="mt-2"
                  >
                    Clear search
                  </Button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-24">Product ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Monthly</TableHead>
                      <TableHead>Setup Fee</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-32">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => (
                      <TableRow key={product.id} className="hover:bg-gray-50">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => copyProductId(product.id)}
                              className="font-mono text-xs px-2 py-1 h-auto"
                              title="Click to copy Product ID"
                            >
                              {product.id}
                              <Copy className="h-3 w-3 ml-1" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="font-medium max-w-xs">
                          <div className="truncate" title={product.name}>
                            {product.name}
                          </div>
                        </TableCell>
                        <TableCell className="max-w-sm">
                          <div className="truncate text-sm text-gray-600" title={product.description}>
                            {product.description || 'No description available'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className="font-semibold">
                            {formatPrice(product.pricing?.monthly, credit?.currency || '$')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {formatPrice(product.pricing?.setup, credit?.currency || '$')}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">
                            {product.category || 'General'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={product.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {product.status || 'Available'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => viewProductDetails(product)}
                              title="View details"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => copyProductInfo(product)}
                              title="Copy product info"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openCreateIPStock(product.id)}
                              title="Create IP Stock with this product"
                              className="text-green-600 hover:text-green-700 hover:bg-green-50"
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Product Details Dialog */}
      {selectedProduct && (
        <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Product Details</DialogTitle>
              <DialogDescription>
                Complete information for Hostycare Product ID: {selectedProduct.id}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-600">Product ID</label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="bg-gray-100 px-2 py-1 rounded text-sm">
                      {selectedProduct.id}
                    </code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => copyProductId(selectedProduct.id)}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-600">Category</label>
                  <p className="mt-1">
                    <Badge variant="secondary">
                      {selectedProduct.category || 'General'}
                    </Badge>
                  </p>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-600">Product Name</label>
                <p className="mt-1 font-medium">{selectedProduct.name}</p>
              </div>

              {selectedProduct.description && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Description</label>
                  <p className="mt-1 text-sm text-gray-700 leading-relaxed">
                    {selectedProduct.description}
                  </p>
                </div>
              )}

              {/* Pricing */}
              {selectedProduct.pricing && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Pricing</label>
                  <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4">
                    {selectedProduct.pricing.monthly && (
                      <div className="bg-blue-50 p-3 rounded-lg">
                        <div className="text-xs text-blue-600 font-medium">MONTHLY</div>
                        <div className="text-lg font-semibold text-blue-700">
                          {formatPrice(selectedProduct.pricing.monthly, credit?.currency)}
                        </div>
                      </div>
                    )}
                    {selectedProduct.pricing.quarterly && (
                      <div className="bg-green-50 p-3 rounded-lg">
                        <div className="text-xs text-green-600 font-medium">QUARTERLY</div>
                        <div className="text-lg font-semibold text-green-700">
                          {formatPrice(selectedProduct.pricing.quarterly, credit?.currency)}
                        </div>
                      </div>
                    )}
                    {selectedProduct.pricing.annually && (
                      <div className="bg-purple-50 p-3 rounded-lg">
                        <div className="text-xs text-purple-600 font-medium">ANNUALLY</div>
                        <div className="text-lg font-semibold text-purple-700">
                          {formatPrice(selectedProduct.pricing.annually, credit?.currency)}
                        </div>
                      </div>
                    )}
                    {selectedProduct.pricing.setup && (
                      <div className="bg-orange-50 p-3 rounded-lg">
                        <div className="text-xs text-orange-600 font-medium">SETUP FEE</div>
                        <div className="text-lg font-semibold text-orange-700">
                          {formatPrice(selectedProduct.pricing.setup, credit?.currency)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Configuration Options */}
              {selectedProduct.configOptions && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Configuration Options</label>
                  <pre className="mt-2 bg-gray-100 p-3 rounded-lg text-xs overflow-x-auto">
                    {JSON.stringify(selectedProduct.configOptions, null, 2)}
                  </pre>
                </div>
              )}

              {/* Features */}
              {selectedProduct.features && selectedProduct.features.length > 0 && (
                <div>
                  <label className="text-sm font-medium text-gray-600">Features</label>
                  <ul className="mt-2 list-disc list-inside space-y-1 text-sm">
                    {selectedProduct.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-4 border-t">
                <Button
                  onClick={() => openCreateIPStock(selectedProduct.id)}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create IP Stock with this Product
                </Button>
                <Button
                  variant="outline"
                  onClick={() => copyProductInfo(selectedProduct)}
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Product Info
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default HostycareProductsPage;
