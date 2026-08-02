return {
  { "ellisonleao/gruvbox.nvim" },
  {
    "sainnhe/sonokai",
    lazy = false,
    priority = 1000,
    config = function()
      vim.cmd('colorscheme sonokai')
    end,
  },
}
